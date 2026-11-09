import { createHash } from "node:crypto";
import { and, desc, eq, inArray, max, or } from "drizzle-orm";
import type { Authorized } from "@/lib/experts/api";
import { runAi } from "@/lib/case/api";
import { experts, sources } from "@/db/schema";
import { anonymizeTitle } from "@/lib/experts/calc";
import { placeSourceFile, saveSourceFile, type Source } from "@/lib/storage/files";
import { findLinks, suggestFolders, versionStem, type CaseRef } from "./classify";
import { extractText } from "./extract";
import { addCaseFolders, cleanPath, loadCaseFolders } from "./folders";

/** Where files wait in Drive until someone confirms their folder. */
export const INBOX = "To file";

/** The case's own folder name in the firm's storage. */
export function caseFolderName(engagement: { clientName: string; title: string }): string {
  return engagement.clientName || engagement.title || "Case";
}

export type IntakeResult = { duplicate: true; source: Source } | { duplicate: false; source: Source };

/**
 * Takes in one dropped or attached file: skips exact duplicates, reads its text, suggests
 * folders, spots a newer version of an existing file, and saves it as waiting to be filed.
 */
export async function intakeFile(
  auth: Authorized,
  input: { file: File; relPath?: string | null; batchId?: string | null; roomId?: string | null },
): Promise<IntakeResult> {
  const { db, user, engagement } = auth;
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  // Some browsers name files inside a dropped folder "folder/file"; keep the file name alone.
  const base = input.file.name.split(/[\\/]/).pop() || "upload";
  if (base !== input.file.name) input = { ...input, file: new File([bytes], base, { type: input.file.type }) };
  const hash = createHash("sha256").update(bytes).digest("hex");

  const dup = await db.query.sources.findFirst({ where: and(eq(sources.engagementId, engagement.id), eq(sources.contentHash, hash)) });
  if (dup) return { duplicate: true, source: dup };

  const text = await extractText(input.file.name, bytes);
  const folders = await loadCaseFolders(db, engagement.id);
  const relPath = input.relPath?.replace(/\\/g, "/").replace(/^\/+/, "").slice(0, 500) || null;
  const facts = { name: input.file.name, relPath, text };
  let { folders: suggested, sure } = suggestFolders(facts, folders);

  const candidate = await findVersionCandidate(auth, input.file.name);
  if (candidate?.folder) suggested = [candidate.folder, ...suggested.filter((f) => f !== candidate.folder)];
  else if (!sure) {
    const ai = await aiSuggest(auth, facts, folders).catch((err) => {
      console.warn("folder suggestion: AI unavailable", err instanceof Error ? err.message : err);
      return [];
    });
    if (ai.length) suggested = [...new Set([...ai, ...suggested])];
  }

  const links = findLinks(facts, await expertRefs(auth));
  const source = await saveSourceFile(db, {
    firmId: user.firmId,
    engagementId: engagement.id,
    storageConnectionId: engagement.storageConnectionId,
    file: input.file,
    bytes,
    uploadedBy: user.id,
    place: [caseFolderName(engagement), INBOX],
    values: {
      filing: "pending",
      suggestions: JSON.stringify(suggested.slice(0, 2)),
      links: JSON.stringify(links),
      contentHash: hash,
      versionCandidate: candidate?.id ?? null,
      relPath,
      textBody: text || null,
      roomId: input.roomId ?? null,
      batchId: input.batchId ?? null,
    },
  });
  return { duplicate: false, source };
}

/** The newest filed file with the same name once version marks are removed. */
async function findVersionCandidate(auth: Authorized, filename: string): Promise<Source | null> {
  const stem = versionStem(filename);
  const ext = filename.toLowerCase().split(".").pop();
  if (!stem) return null;
  const rows = await auth.db
    .select()
    .from(sources)
    .where(and(eq(sources.engagementId, auth.engagement.id), eq(sources.filing, "filed")))
    .orderBy(desc(sources.createdAt));
  return rows.find((r) => r.filename.toLowerCase().split(".").pop() === ext && versionStem(r.filename) === stem) ?? null;
}

async function expertRefs(auth: Authorized): Promise<CaseRef[]> {
  const rows = await auth.db
    .select({ id: experts.id, company: experts.company, title: experts.title, anonTitle: experts.anonTitle, isFormer: experts.isFormer })
    .from(experts)
    .where(eq(experts.engagementId, auth.engagement.id));
  return rows.map((e) => {
    const label = e.anonTitle || anonymizeTitle(e.company, e.title, e.isFormer);
    // Only distinctive codes ("OEM 16", "Person 37"), never a bare word that could match anything.
    const keys = [e.company, e.anonTitle ?? ""].filter((k) => /\d/.test(k) && k.trim().length >= 4);
    return { kind: "expert" as const, id: e.id, label, keys };
  });
}

async function aiSuggest(auth: Authorized, facts: { name: string; relPath: string | null; text: string }, folders: string[]): Promise<string[]> {
  const reply = await Promise.race([
    runAi(auth, "file_filing", {
      system:
        "You file documents for a consulting case team. Pick the folder each file belongs in, from the list given. Reply with one or two folder paths copied exactly from the list, one per line, best first, and nothing else.",
      messages: [
        {
          role: "user",
          content: `Folders:\n${folders.join("\n")}\n\nFile name: ${facts.name}${facts.relPath ? `\nDropped as: ${facts.relPath}` : ""}\n\nStart of the file:\n${facts.text.slice(0, 3000) || "(no text)"}`,
        },
      ],
      maxTokens: 60,
    }),
    new Promise<string>((_, reject) => setTimeout(() => reject(new Error("timeout")), 20_000)),
  ]);
  const set = new Set(folders);
  return reply
    .split("\n")
    .map((l) => l.replace(/^[\s\-*\d.)]+/, "").trim())
    .filter((l) => set.has(l))
    .slice(0, 2);
}

/**
 * Confirms where waiting files go. A file confirmed as a new version joins that file's
 * stack. In Google Drive the file moves out of "To file" into the real folder.
 */
export async function fileSources(
  auth: Authorized,
  items: { sourceId: string; folder: string; asVersion?: boolean }[],
): Promise<number> {
  const { db, user, engagement } = auth;
  const ids = items.map((i) => i.sourceId);
  if (!ids.length) return 0;
  const rows = await db.select().from(sources).where(and(eq(sources.engagementId, engagement.id), inArray(sources.id, ids)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  await addCaseFolders(db, engagement.id, items.map((i) => cleanPath(i.folder)));
  let n = 0;
  for (const item of items) {
    const src = byId.get(item.sourceId);
    if (!src) continue;
    const folder = cleanPath(item.folder);
    let versionOf: string | null = src.versionOf;
    let version = src.version;
    if (item.asVersion && src.versionCandidate) {
      const prev = await db.query.sources.findFirst({ where: and(eq(sources.id, src.versionCandidate), eq(sources.engagementId, engagement.id)) });
      if (prev) {
        versionOf = prev.versionOf ?? prev.id;
        const [m] = await db
          .select({ v: max(sources.version) })
          .from(sources)
          .where(and(eq(sources.engagementId, engagement.id), or(eq(sources.id, versionOf), eq(sources.versionOf, versionOf))));
        version = (m?.v ?? 1) + 1;
      }
    }
    let objectKey = src.objectKey;
    try {
      objectKey = await placeSourceFile(db, user.firmId, src, [caseFolderName(engagement), ...folder.split("/").filter(Boolean)]);
    } catch (err) {
      console.error("moving file in storage failed", src.id, err);
      throw new Error(`Couldn't move ${src.filename} in the firm's storage.`);
    }
    await db
      .update(sources)
      .set({ filing: "filed", folder, versionOf, version, versionCandidate: null, objectKey })
      .where(eq(sources.id, src.id));
    n++;
  }
  return n;
}
