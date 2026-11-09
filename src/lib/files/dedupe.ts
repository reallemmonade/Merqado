import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { engagements, sources } from "@/db/schema";
import { deleteSourceBytes, sourceMeta, type SourceMeta } from "@/lib/storage/files";

// Insertion order: the copy saved first is the one kept, even when two land in the same second.
const firstSaved = sql`rowid`;

/**
 * The copy of these bytes that was saved first in the case. Two uploads of the same file
 * can run at once, so each checks again after saving and the later one steps aside.
 */
export async function firstCopy(db: DB, engagementId: string, hash: string): Promise<SourceMeta | undefined> {
  const [row] = await db
    .select(sourceMeta)
    .from(sources)
    .where(and(eq(sources.engagementId, engagementId), eq(sources.contentHash, hash)))
    .orderBy(asc(firstSaved))
    .limit(1);
  return row;
}

/** Removes a waiting file and its stored bytes. */
export async function removeSource(db: DB, firmId: string, source: SourceMeta): Promise<void> {
  await deleteSourceBytes(db, firmId, source).catch((err) => console.warn("duplicate: storage delete failed", source.id, err));
  await db.delete(sources).where(eq(sources.id, source.id));
}

/**
 * Clears extra copies still waiting to be filed: any waiting file whose exact bytes were
 * already saved earlier in the case. Chat files and filed files are never touched.
 */
export async function removeWaitingDuplicates(db: DB, engagementId: string): Promise<number> {
  const rows = await db
    .select(sourceMeta)
    .from(sources)
    .where(and(eq(sources.engagementId, engagementId), isNotNull(sources.contentHash)))
    .orderBy(asc(firstSaved));
  const seen = new Set<string>();
  const extra: SourceMeta[] = [];
  for (const source of rows) {
    const h = source.contentHash!;
    if (!seen.has(h)) seen.add(h);
    else if (source.filing === "pending" && !source.roomId && !source.messageId) extra.push(source);
  }
  if (!extra.length) return 0;
  const eng = await db.query.engagements.findFirst({ where: eq(engagements.id, engagementId) });
  if (!eng) return 0;
  for (const s of extra) await removeSource(db, eng.firmId, s);
  return extra.length;
}

