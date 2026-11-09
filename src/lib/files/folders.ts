import { asc, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { caseFolders, sources } from "@/db/schema";

/** Where every new case starts. Each case can add or remove folders. */
export const DEFAULT_FOLDERS = [
  "Admin",
  "Admin/Compliance",
  "Admin/Expenses",
  "Client",
  "Client/Data",
  "Client/Emails",
  "Interviews",
  "Interviews/Guides",
  "Interviews/Transcripts",
  "Meetings",
  "Meetings/Transcripts",
  "Meetings/Recordings",
  "Models",
  "Models/Surveys",
  "Research",
  "Deliverables",
  "Deliverables/Presentations",
  "Deliverables/Final",
  "Workplan",
  "Workplan/Issue map",
  "Knowledge",
  "Knowledge/LDK IP",
  "Working",
] as const;

/** Cleans a typed folder path: trims each part, drops empty parts, joins with "/". */
export function cleanPath(path: string): string {
  return path
    .split("/")
    .map((p) => p.replace(/\s+/g, " ").trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 4)
    .join("/");
}

/** Every folder path plus its parents, e.g. "A/B/C" gives "A", "A/B", "A/B/C". */
export function withParents(path: string): string[] {
  const parts = path.split("/");
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
}

/**
 * The case's folders in display order. Seeds the default list the first time, and keeps
 * any folder a file already sits in, so nothing is ever hidden.
 */
export async function loadCaseFolders(db: DB, engagementId: string): Promise<string[]> {
  let rows = await db.select({ path: caseFolders.path }).from(caseFolders).where(eq(caseFolders.engagementId, engagementId)).orderBy(asc(caseFolders.sort));
  if (rows.length === 0) {
    await db
      .insert(caseFolders)
      .values(DEFAULT_FOLDERS.map((path, sort) => ({ engagementId, path, sort })))
      .onConflictDoNothing();
    rows = DEFAULT_FOLDERS.map((path) => ({ path }));
  }
  const used = await db.selectDistinct({ folder: sources.folder }).from(sources).where(eq(sources.engagementId, engagementId));
  return sortFolders([...rows.map((r) => r.path), ...used.flatMap((u) => (u.folder ? withParents(u.folder) : []))]);
}

/** De-duplicates and orders folders so children follow their parent, keeping the template's order. */
export function sortFolders(paths: string[]): string[] {
  const seen: string[] = [];
  for (const p of paths) for (const q of withParents(p)) if (!seen.includes(q)) seen.push(q);
  const order = new Map(seen.map((p, i) => [p, i]));
  const key = (p: string) => withParents(p).map((q) => String(order.get(q) ?? 0).padStart(5, "0"));
  return seen.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < Math.min(ka.length, kb.length); i++) if (ka[i] !== kb[i]) return ka[i]! < kb[i]! ? -1 : 1;
    return ka.length - kb.length;
  });
}

/** Adds folders (and their parents) to a case if missing. */
export async function addCaseFolders(db: DB, engagementId: string, paths: string[]) {
  const all = [...new Set(paths.filter(Boolean).flatMap(withParents))];
  if (!all.length) return;
  const existing = await db.select({ path: caseFolders.path, sort: caseFolders.sort }).from(caseFolders).where(eq(caseFolders.engagementId, engagementId));
  const have = new Set(existing.map((e) => e.path));
  let sort = existing.reduce((m, e) => Math.max(m, e.sort), 0);
  const rows = all.filter((p) => !have.has(p)).map((path) => ({ engagementId, path, sort: ++sort }));
  if (rows.length) await db.insert(caseFolders).values(rows).onConflictDoNothing();
}
