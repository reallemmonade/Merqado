import { and, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { sourceBlobs, sources } from "@/db/schema";
import { resolveStorage } from "./index";

/** Object keys that mean "the bytes are in the database" rather than in the firm's storage. */
const DB_PREFIX = "db:";
/** Largest file kept in the database while a firm has no storage connected. */
export const MAX_DB_FILE_BYTES = 20 * 1024 * 1024;

export type Source = typeof sources.$inferSelect;

/**
 * Saves an uploaded file as a source: into the firm's own storage when one is connected,
 * otherwise into the database so it can still be opened later.
 */
export async function saveSourceFile(
  db: DB,
  opts: {
    firmId: string;
    engagementId: string;
    storageConnectionId?: string | null;
    file: File;
    uploadedBy: string;
    /** Folder path in stores people browse (Google Drive), e.g. ["Project Atlas", "To file"]. */
    place?: string[];
    bytes?: Uint8Array;
    /** Extra columns for the new row (filing state, suggestions, text...). */
    values?: Partial<typeof sources.$inferInsert>;
  },
): Promise<Source> {
  const { file } = opts;
  const bytes = opts.bytes ?? new Uint8Array(await file.arrayBuffer());
  const mimeType = file.type || guessType(file.name) || null;

  let storage: Awaited<ReturnType<typeof resolveStorage>> | null = null;
  try {
    storage = await resolveStorage(db, opts.firmId, opts.storageConnectionId);
  } catch (err) {
    if (!(err instanceof Error && /No storage connected/.test(err.message))) throw err;
  }

  if (storage) {
    const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 200) || "upload";
    const key =
      storage.storage.pathKeys && opts.place
        ? [...opts.place, file.name].map(safeSegment).join("/")
        : `engagements/${opts.engagementId}/${crypto.randomUUID()}/${safeName}`;
    const stored = await storage.storage.put(key, bytes, mimeType ?? undefined);
    const [row] = await db
      .insert(sources)
      .values({
        ...opts.values,
        engagementId: opts.engagementId,
        storageConnectionId: storage.connectionId,
        objectKey: stored.key || key,
        filename: file.name,
        mimeType,
        sizeBytes: file.size,
        uploadedBy: opts.uploadedBy,
      })
      .returning();
    return row!;
  }

  if (bytes.byteLength > MAX_DB_FILE_BYTES) {
    throw new Error("Files over 20 MB need the firm's cloud storage connected first.");
  }
  const id = crypto.randomUUID();
  const [row] = await db
    .insert(sources)
    .values({
      ...opts.values,
      id,
      engagementId: opts.engagementId,
      storageConnectionId: null,
      objectKey: `${DB_PREFIX}${id}`,
      filename: file.name,
      mimeType,
      sizeBytes: file.size,
      uploadedBy: opts.uploadedBy,
    })
    .returning();
  await db.insert(sourceBlobs).values({ sourceId: id, data: Buffer.from(bytes) });
  return row!;
}

/** A folder or case name made safe for a storage path. */
export function safeSegment(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "Untitled";
}

/**
 * Puts a file into its folder in stores people browse (Google Drive). Elsewhere the folder
 * lives only in Merqado and the stored object stays where it is.
 */
export async function placeSourceFile(db: DB, firmId: string, source: Source, place: string[]): Promise<string> {
  if (source.objectKey.startsWith(DB_PREFIX)) return source.objectKey;
  const { storage } = await resolveStorage(db, firmId, source.storageConnectionId);
  if (!storage.move || !storage.pathKeys) return source.objectKey;
  return storage.move(source.objectKey, [...place, source.filename].map(safeSegment).join("/"));
}

/** Removes a file's bytes from wherever they were saved (Drive: to its trash). */
export async function deleteSourceBytes(db: DB, firmId: string, source: Source): Promise<void> {
  if (source.objectKey.startsWith(DB_PREFIX)) return; // the row's cascade removes the blob
  const { storage } = await resolveStorage(db, firmId, source.storageConnectionId);
  await storage.delete(source.objectKey);
}

/** A source in this engagement, or undefined. */
export async function findSource(db: DB, engagementId: string, sourceId: string) {
  return db.query.sources.findFirst({ where: and(eq(sources.id, sourceId), eq(sources.engagementId, engagementId)) });
}

/** Reads a source's original bytes from wherever they were saved. */
export async function readSourceFile(db: DB, firmId: string, source: Source): Promise<Uint8Array> {
  if (source.objectKey.startsWith(DB_PREFIX)) {
    const row = await db.query.sourceBlobs.findFirst({ where: eq(sourceBlobs.sourceId, source.id) });
    if (!row) throw new Error("File not found.");
    return new Uint8Array(row.data);
  }
  const { storage } = await resolveStorage(db, firmId, source.storageConnectionId);
  return storage.get(source.objectKey);
}

const TYPES: Record<string, string> = {
  txt: "text/plain; charset=utf-8",
  md: "text/plain; charset=utf-8",
  vtt: "text/plain; charset=utf-8",
  srt: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

export function guessType(filename: string): string | undefined {
  return TYPES[filename.split(".").pop()?.toLowerCase() ?? ""];
}

/** Types a browser can show safely in a new tab; everything else downloads. */
const VIEWABLE = /^(text\/plain|application\/pdf|image\/(png|jpeg|gif|webp))\b/;

/** The response that opens (or downloads) a file under its original name. */
export function fileResponse(bytes: Uint8Array, filename: string, mimeType?: string | null): Response {
  const type = guessType(filename) ?? mimeType ?? "application/octet-stream";
  // Text and captions open as plain text, never as a page that could run code.
  const safeType = /^text\//.test(type) && !/^text\/(plain|csv)/.test(type) ? "text/plain; charset=utf-8" : type;
  const inline = VIEWABLE.test(safeType);
  const ascii = filename.replace(/[^\x20-\x7e]+/g, "_").replace(/["\\]/g, "_");
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": safeType,
      "content-length": String(bytes.byteLength),
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "x-content-type-options": "nosniff",
      // Chrome won't show PDFs under a sandbox policy; everything else gets one as a backstop.
      ...(safeType === "application/pdf" ? {} : { "content-security-policy": "sandbox; default-src 'none'" }),
      "cache-control": "private, no-store",
    },
  });
}
