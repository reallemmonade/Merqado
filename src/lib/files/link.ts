import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { engagements, sources } from "@/db/schema";
import type { Authorized } from "@/lib/experts/api";
import { resolveStorage } from "@/lib/storage";
import { linkKey, sourceMeta, type Source, type SourceMeta } from "@/lib/storage/files";
import { driveFileIdFromLink, GDriveStorage, type DriveFileMeta } from "@/lib/storage/providers/gdrive";
import { extractText } from "./extract";
import { suggestPlace } from "./intake";

const MAX_BYTES = 100 * 1024 * 1024;
const FOLDER = "application/vnd.google-apps.folder";

export class LinkError extends Error {}

/** True for OneDrive and SharePoint links, which need a Microsoft storage connection. */
export function isMicrosoftLink(link: string): boolean {
  try {
    const h = new URL(link.trim()).hostname;
    return /(^|\.)(1drv\.ms|onedrive\.live\.com|sharepoint\.com)$/.test(h);
  } catch {
    return false;
  }
}

async function driveOf(db: DB, firmId: string, connectionId: string | null): Promise<{ drive: GDriveStorage; connectionId: string | null }> {
  const r = await resolveStorage(db, firmId, connectionId).catch(() => null);
  if (!r || !(r.storage instanceof GDriveStorage)) throw new LinkError("Connect Google Drive in Settings first.");
  return { drive: r.storage, connectionId: r.connectionId };
}

/** Reads a linked original's text, under the name it should be read as. */
async function readOriginal(drive: GDriveStorage, meta: DriveFileMeta) {
  if (Number(meta.size ?? 0) > MAX_BYTES) throw new LinkError("Files are limited to 100 MB.");
  const { bytes, filename } = await drive.readLinked(meta);
  return { bytes, filename, text: await extractText(filename, bytes) };
}

export type LinkResult = { duplicate: true; source: SourceMeta } | { duplicate: false; source: Source };

/**
 * Adds a Google Drive file to the case as a link to the live original, not a copy. It waits
 * to be filed like a dropped file; filing or deleting it never moves or trashes the original.
 */
export async function linkDriveFile(auth: Authorized, input: { url: string; batchId?: string | null }): Promise<LinkResult> {
  const { db, user, engagement } = auth;
  const fileId = driveFileIdFromLink(input.url);
  if (!fileId) throw new LinkError(isMicrosoftLink(input.url) ? "OneDrive isn't connected yet." : "Use a Google Drive file link.");

  const [already] = await db
    .select(sourceMeta)
    .from(sources)
    .where(and(eq(sources.engagementId, engagement.id), eq(sources.originKind, "gdrive"), eq(sources.originRef, fileId), isNull(sources.deletedAt)))
    .limit(1);
  if (already) return { duplicate: true, source: already };

  const { drive, connectionId } = await driveOf(db, user.firmId, engagement.storageConnectionId);
  const meta = await drive.meta(fileId).catch(() => {
    throw new LinkError("Merqado can't open that file. Share it with the firm's Drive account.");
  });
  if (meta.mimeType === FOLDER) throw new LinkError("Link a file, not a folder.");
  if (meta.trashed) throw new LinkError("That file is in the Drive trash.");
  const { bytes, filename, text } = await readOriginal(drive, meta);
  const { suggested, candidate, links } = await suggestPlace(auth, { name: filename, relPath: null, text });

  const [source] = await db
    .insert(sources)
    .values({
      engagementId: engagement.id,
      storageConnectionId: connectionId,
      objectKey: linkKey("gdrive", fileId),
      filename,
      mimeType: meta.mimeType,
      sizeBytes: bytes.byteLength,
      uploadedBy: user.id,
      filing: "pending",
      suggestions: JSON.stringify(suggested.slice(0, 2)),
      links: JSON.stringify(links),
      versionCandidate: candidate?.id ?? null,
      textBody: text || null,
      batchId: input.batchId ?? null,
      originKind: "gdrive",
      originRef: fileId,
      originUrl: meta.webViewLink ?? GDriveStorage.webLink(fileId),
      originVersion: meta.modifiedTime ?? null,
      originCheckedAt: new Date(),
    })
    .returning();
  return { duplicate: false, source: source! };
}

/**
 * Checks linked Drive originals for edits and refreshes the cached text of any that changed,
 * oldest-checked first. Changed files are queued for a new dictionary scan.
 */
export async function refreshLinkedFiles(db: DB, now: Date, limit = 200): Promise<{ checked: number; updated: number; failed: number }> {
  const rows = await db
    .select({ ...sourceMeta, firmId: engagements.firmId })
    .from(sources)
    .innerJoin(engagements, eq(engagements.id, sources.engagementId))
    .where(and(eq(sources.originKind, "gdrive"), isNull(sources.deletedAt)))
    .orderBy(asc(sql`coalesce(${sources.originCheckedAt}, 0)`))
    .limit(limit);
  const drives = new Map<string, Promise<GDriveStorage>>();
  let updated = 0;
  let failed = 0;
  const checkedIds: string[] = [];
  for (const s of rows) {
    if (!s.originRef) continue;
    try {
      const key = `${s.firmId}:${s.storageConnectionId ?? ""}`;
      if (!drives.has(key)) drives.set(key, driveOf(db, s.firmId, s.storageConnectionId).then((d) => d.drive));
      const drive = await drives.get(key)!;
      const meta = await drive.meta(s.originRef);
      if (!meta.trashed && meta.modifiedTime && meta.modifiedTime !== s.originVersion) {
        const { bytes, filename, text } = await readOriginal(drive, meta);
        await db
          .update(sources)
          .set({
            filename,
            sizeBytes: bytes.byteLength,
            textBody: text || null,
            originVersion: meta.modifiedTime,
            originUrl: meta.webViewLink ?? s.originUrl,
            originCheckedAt: now,
            termsScannedAt: null,
          })
          .where(eq(sources.id, s.id));
        updated++;
      } else checkedIds.push(s.id);
    } catch (err) {
      console.warn("linked file check failed", s.id, err instanceof Error ? err.message : err);
      checkedIds.push(s.id);
      failed++;
    }
  }
  if (checkedIds.length) await db.update(sources).set({ originCheckedAt: now }).where(inArray(sources.id, checkedIds));
  return { checked: rows.length, updated, failed };
}
