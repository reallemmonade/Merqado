import { and, desc, eq, gte, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db/client";
import { engagements, glossaryTerms, sources } from "@/db/schema";
import { completeAndMeter, resolveProvider } from "@/lib/ai";
import { extractJson } from "@/lib/experts/api";
import { publishCaseChange } from "@/lib/live/hub";

export type Complete = (req: { system: string; messages: { role: "user"; content: string }[]; maxTokens: number }) => Promise<string>;

export const TERM_CATEGORIES = ["Industry", "Acronym", "Product", "Finance", "Legal", "Technical"] as const;
/** How much of one file the model reads. */
export const FILE_TEXT_LIMIT = 30_000;
/** Files older than this are not scanned by the scheduler sweep. */
export const SWEEP_DAYS = 30;
/** Files scanned per scheduler tick, to keep each tick short. */
export const SWEEP_LIMIT = 10;

/** Most terms taken from one model reply. */
export const MAX_TERMS = 30;

const Reply = z.object({
  terms: z
    .array(
      z.object({
        term: z.string(),
        category: z.string().optional().default("Industry"),
        definition: z.string().optional().default(""),
      }),
    )
    .transform((terms) => terms.slice(0, MAX_TERMS)),
});

export type NewTerm = { term: string; category: string; definition: string };

/** Ways a term is written: "Statement of Work (SOW)" matches "SOW" and "statement of work". */
export function termKeys(term: string): string[] {
  const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9'&+/.-]+/g, " ").replace(/\s+/g, " ").trim();
  const keys = new Set<string>();
  const whole = norm(term);
  if (whole) keys.add(whole);
  const m = term.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (m) {
    for (const part of [m[1]!, m[2]!]) {
      const k = norm(part);
      if (k) keys.add(k);
    }
  }
  return [...keys];
}

/** The client's real name never goes into the dictionary. */
export function blockedNames(engagement: { clientName: string }): string[] {
  const name = engagement.clientName.trim().toLowerCase();
  // A placeholder like "Client" is fine; only block real, distinctive names.
  if (name.length < 3 || name === "client") return [];
  return [name];
}

function mentionsBlocked(text: string, blocked: string[]): boolean {
  const t = text.toLowerCase();
  return blocked.some((b) => t.includes(b));
}

export function buildTermPrompt(existing: string[]): string {
  return (
    "You keep a case dictionary for a consulting team. From the document(s), pick the technical terms, industry jargon and acronyms a new team member would need explained, " +
    "that are not already in the dictionary. Skip everyday words, names of people, names of companies and clients, and project code names. " +
    `List at most ${MAX_TERMS}, most useful first. Define each in one short plain sentence. Reply with JSON only: {"terms":[{"term":"","category":"${TERM_CATEGORIES.join("|")}","definition":""}]}. ` +
    'Write an acronym as "Full Name (ACRONYM)". Reply {"terms":[]} if nothing new.\n\n' +
    `Already in the dictionary: ${existing.join(", ") || "none"}`
  );
}

/** Keeps only well-formed terms that aren't already in the dictionary and don't name the client. */
/**
 * The model's JSON reply. A long reply can be cut off mid-list, so when the whole reply
 * doesn't parse, the complete term entries before the cut are kept.
 */
export function readTermsReply(text: string): unknown {
  try {
    return extractJson(text);
  } catch {
    const terms: unknown[] = [];
    for (const m of text.matchAll(/\{[^{}]*"term"\s*:[^{}]*\}/g)) {
      try {
        terms.push(JSON.parse(m[0]));
      } catch {
        // A half-written entry; skip it.
      }
    }
    if (!terms.length) throw new Error("The model did not return any terms.");
    return { terms };
  }
}

export function pickNewTerms(reply: unknown, existing: string[], blocked: string[]): NewTerm[] {
  const parsed = Reply.safeParse(reply);
  if (!parsed.success) return [];
  const have = new Set(existing.flatMap(termKeys));
  const out: NewTerm[] = [];
  for (const t of parsed.data.terms) {
    const term = t.term.trim().slice(0, 120);
    const definition = t.definition.trim().slice(0, 2000);
    if (!term || !definition) continue;
    if (mentionsBlocked(term, blocked) || mentionsBlocked(definition, blocked)) continue;
    const keys = termKeys(term);
    if (!keys.length || keys.some((k) => have.has(k))) continue;
    keys.forEach((k) => have.add(k));
    const category = (TERM_CATEGORIES as readonly string[]).find((c) => c.toLowerCase() === t.category.trim().toLowerCase()) ?? "Industry";
    out.push({ term, category, definition });
  }
  return out;
}

/** A model call billed to the case's firm, on the case's AI connection. */
export function caseCompleter(db: DB, engagement: { id: string; firmId: string; aiProviderId: string | null }, userId: string | null): Complete {
  return async (req) => {
    const resolved = await resolveProvider(db, engagement.firmId, engagement.aiProviderId);
    const result = await completeAndMeter(db, resolved, req, {
      firmId: engagement.firmId,
      engagementId: engagement.id,
      userId: userId ?? undefined,
      feature: "dictionary_scan",
    });
    if (result.refused) throw new Error("The model declined this request.");
    return result.text;
  };
}

/**
 * Reads one file for terms the case dictionary doesn't have yet and adds them, defined.
 * Each file is read once: the file is claimed first, so an upload and the scheduler never
 * both read it. Files shared in a private chat are skipped, since everyone on the case sees
 * the dictionary.
 */
export async function scanFileForTerms(db: DB, sourceId: string, complete?: Complete): Promise<{ added: number }> {
  const claimed = await db
    .update(sources)
    .set({ termsScannedAt: new Date() })
    .where(and(eq(sources.id, sourceId), isNull(sources.termsScannedAt)))
    .returning({ engagementId: sources.engagementId, textBody: sources.textBody, roomId: sources.roomId, uploadedBy: sources.uploadedBy });
  const src = claimed[0];
  if (!src || src.roomId || !src.textBody?.trim()) return { added: 0 };

  const engagement = await db.query.engagements.findFirst({ where: eq(engagements.id, src.engagementId) });
  if (!engagement) return { added: 0 };

  try {
    return { added: await addTermsFrom(db, engagement, src.textBody.slice(0, FILE_TEXT_LIMIT), complete ?? caseCompleter(db, engagement, src.uploadedBy)) };
  } catch (err) {
    // Let the scheduler try again later.
    await db.update(sources).set({ termsScannedAt: null }).where(eq(sources.id, sourceId));
    throw err;
  }
}

type CaseRow = { id: string; firmId: string; clientName: string; aiProviderId: string | null };

/** Asks the model for terms in this text and adds the new ones. */
async function addTermsFrom(db: DB, engagement: CaseRow, text: string, run: Complete, serial: Serial = (fn) => fn()): Promise<number> {
  const existing = (await db.select({ term: glossaryTerms.term }).from(glossaryTerms).where(eq(glossaryTerms.engagementId, engagement.id))).map((r) => r.term);
  const reply = await run({ system: buildTermPrompt(existing), messages: [{ role: "user", content: text }], maxTokens: 4000 });
  // Read the list again: another file may have added terms while the model was working.
  return serial(async () => {
    const now = (await db.select({ term: glossaryTerms.term }).from(glossaryTerms).where(eq(glossaryTerms.engagementId, engagement.id))).map((r) => r.term);
    const fresh = pickNewTerms(readTermsReply(reply), now, blockedNames(engagement));
    if (fresh.length) {
      await db.insert(glossaryTerms).values(fresh.map((t) => ({ engagementId: engagement.id, ...t, status: "active" as const })));
      publishCaseChange(engagement.id);
    }
    return fresh.length;
  });
}

type Serial = (fn: () => Promise<number>) => Promise<number>;

/** Runs the given steps one at a time, so parallel parts never add the same term twice. */
function oneAtATime(): Serial {
  let tail: Promise<unknown> = Promise.resolve();
  return (fn) => {
    const run = tail.then(fn, fn);
    tail = run.catch(() => undefined);
    return run;
  };
}

/** Per file, when re-reading a whole case. */
export const RESCAN_FILE_CHARS = 12_000;
/** Text sent per model call when re-reading a whole case. */
export const RESCAN_CALL_CHARS = 40_000;
/** Model calls running at once when re-reading a whole case. */
const RESCAN_PARALLEL = 4;

/** Groups file texts into model-sized parts, a file never split across parts. */
export function packTexts(files: { name: string; text: string }[], perFile = RESCAN_FILE_CHARS, perCall = RESCAN_CALL_CHARS): string[] {
  const parts: string[] = [];
  let cur = "";
  for (const f of files) {
    const piece = `### ${f.name}\n${f.text.trim().slice(0, perFile)}\n\n`;
    if (cur && cur.length + piece.length > perCall) {
      parts.push(cur);
      cur = "";
    }
    cur += piece;
  }
  if (cur) parts.push(cur);
  return parts;
}

/**
 * Re-reads every file in the case (skipping private chat files) and adds the terms the
 * dictionary doesn't have yet. Used by the dictionary's Scan files button.
 */
export async function rescanCaseFiles(db: DB, engagement: CaseRow, run: Complete): Promise<{ files: number; added: number }> {
  const rows = await db
    .select({ id: sources.id, name: sources.filename, text: sources.textBody })
    .from(sources)
    .where(and(eq(sources.engagementId, engagement.id), isNull(sources.roomId), isNotNull(sources.textBody)))
    .orderBy(desc(sources.createdAt));
  const files = rows.filter((r) => r.text?.trim()).map((r) => ({ name: r.name, text: r.text! }));
  const parts = packTexts(files);
  const serial = oneAtATime();
  let added = 0;
  let worked = 0;
  let failed: unknown = null;
  let next = 0;
  const worker = async () => {
    while (next < parts.length) {
      const part = parts[next++]!;
      try {
        added += await addTermsFrom(db, engagement, part, run, serial);
        worked++;
      } catch (err) {
        console.warn("dictionary rescan: part failed", err instanceof Error ? err.message : err);
        failed ??= err;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(RESCAN_PARALLEL, parts.length) }, worker));
  // Only fail when no part could be read; a part that found nothing new is still a success.
  if (failed && worked === 0) throw failed;
  if (rows.length) await db.update(sources).set({ termsScannedAt: new Date() }).where(and(eq(sources.engagementId, engagement.id), isNull(sources.termsScannedAt)));
  return { files: files.length, added };
}

/** Scheduler sweep: reads recent files no one has scanned yet, newest first, a few per tick. */
export async function sweepNewFiles(db: DB, now = new Date()): Promise<{ files: number; added: number; failed: number }> {
  const since = new Date(now.getTime() - SWEEP_DAYS * 864e5);
  const rows = await db
    .select({ id: sources.id })
    .from(sources)
    .where(and(isNull(sources.termsScannedAt), isNull(sources.roomId), isNotNull(sources.textBody), gte(sources.createdAt, since)))
    .orderBy(desc(sources.createdAt))
    .limit(SWEEP_LIMIT);
  let added = 0;
  let failed = 0;
  for (const r of rows) {
    try {
      added += (await scanFileForTerms(db, r.id)).added;
    } catch (err) {
      failed++;
      console.warn("dictionary scan failed", r.id, err instanceof Error ? err.message : err);
    }
  }
  return { files: rows.length, added, failed };
}
