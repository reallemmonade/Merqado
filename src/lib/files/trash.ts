import { and, eq, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import type { DB } from "@/db/client";
import { expertTranscripts, sources } from "@/db/schema";
import { deleteSourceBytes, restoreSourceBytes, sourceMeta, trashSourceBytes, type SourceMeta } from "@/lib/storage/files";
import { addCaseFolders } from "./folders";

/** Deleted files can be restored for this long; then they're removed for good. */
export const KEEP_DELETED_DAYS = 14;

type CanSee = (s: { roomId: string | null }) => boolean;

/** Every version in the stacks these files belong to, deleted or not. */
async function stacksOf(db: DB, engagementId: string, ids: string[]): Promise<SourceMeta[]> {
  if (!ids.length) return [];
  const picked = await db.select(sourceMeta).from(sources).where(and(eq(sources.engagementId, engagementId), inArray(sources.id, ids)));
  const roots = [...new Set(picked.map((s) => s.versionOf ?? s.id))];
  if (!roots.length) return [];
  return db
    .select(sourceMeta)
    .from(sources)
    .where(and(eq(sources.engagementId, engagementId), or(inArray(sources.id, roots), inArray(sources.versionOf, roots))));
}

/** Files that are an expert transcript stay with the transcript, so they can't be deleted from Files. */
async function transcriptIds(db: DB, engagementId: string, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await db
    .select({ id: expertTranscripts.sourceId })
    .from(expertTranscripts)
    .where(and(eq(expertTranscripts.engagementId, engagementId), inArray(expertTranscripts.sourceId, ids)));
  return new Set(rows.map((r) => r.id).filter((x): x is string => !!x));
}

/**
 * Marks filed files (with all their versions) as deleted. Bytes in Google Drive go to its
 * trash; other stores keep them until the purge. Returns the ids that were deleted.
 */
export async function deleteFiles(
  db: DB,
  opts: { firmId: string; engagementId: string; ids: string[]; canSee: CanSee; now?: Date; allOrNothing?: boolean },
): Promise<string[] | null> {
  const stack = (await stacksOf(db, opts.engagementId, opts.ids)).filter((s) => s.filing === "filed" && !s.deletedAt);
  const locked = await transcriptIds(db, opts.engagementId, stack.map((s) => s.id));
  // One hidden or transcript version keeps the whole stack, so a stack is never half deleted.
  const blocked = new Set(stack.filter((s) => !opts.canSee(s) || locked.has(s.id)).map((s) => s.versionOf ?? s.id));
  if (opts.allOrNothing && blocked.size) return null;
  const rows = stack.filter((s) => !blocked.has(s.versionOf ?? s.id));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  await db.update(sources).set({ deletedAt: opts.now ?? new Date() }).where(inArray(sources.id, ids));
  for (const s of rows) await trashSourceBytes(db, opts.firmId, s).catch((err) => console.warn("delete: storage trash failed", s.id, err));
  return ids;
}

/** Live files in a folder or its subfolders, newest version of each stack included. */
export async function filesInFolder(db: DB, engagementId: string, path: string): Promise<SourceMeta[]> {
  const rows = await db
    .select(sourceMeta)
    .from(sources)
    .where(and(eq(sources.engagementId, engagementId), eq(sources.filing, "filed"), isNull(sources.deletedAt)));
  return rows.filter((s) => s.folder === path || s.folder.startsWith(path + "/"));
}

/** Brings deleted files (and their versions) back, with their folders. Returns the ids restored. */
export async function restoreFiles(db: DB, opts: { firmId: string; engagementId: string; ids: string[]; canSee: CanSee; folders?: string[] }): Promise<string[]> {
  const rows = (await stacksOf(db, opts.engagementId, opts.ids)).filter((s) => s.deletedAt && opts.canSee(s));
  await addCaseFolders(db, opts.engagementId, [...(opts.folders ?? []), ...rows.map((r) => r.folder)].filter(Boolean));
  if (!rows.length) return [];
  for (const s of rows) await restoreSourceBytes(db, opts.firmId, s).catch((err) => console.warn("restore: storage untrash failed", s.id, err));
  const ids = rows.map((r) => r.id);
  await db.update(sources).set({ deletedAt: null }).where(inArray(sources.id, ids));
  return ids;
}

/** Removes files deleted more than KEEP_DELETED_DAYS ago, bytes and all. */
export async function purgeDeleted(db: DB, now: Date, firmOf: (engagementId: string) => Promise<string | null>): Promise<{ purged: number; failed: number }> {
  const cutoff = new Date(now.getTime() - KEEP_DELETED_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select(sourceMeta)
    .from(sources)
    .where(and(isNotNull(sources.deletedAt), lt(sources.deletedAt, cutoff)))
    .limit(500);
  let purged = 0;
  let failed = 0;
  for (const s of rows) {
    try {
      const firmId = await firmOf(s.engagementId);
      // Bytes already gone from the store (emptied trash) don't hold the row back.
      if (firmId) await deleteSourceBytes(db, firmId, s).catch((err) => {
        if (!/\b404\b|not found/i.test(err instanceof Error ? err.message : String(err))) throw err;
      });
      await db.delete(sources).where(eq(sources.id, s.id));
      purged++;
    } catch (err) {
      console.warn("purge failed", s.id, err);
      failed++;
    }
  }
  return { purged, failed };
}
