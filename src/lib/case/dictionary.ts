import { and, desc, eq, gte, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db/client";
import { engagements, glossaryTerms, sources } from "@/db/schema";
import { completeAndMeter, resolveProvider } from "@/lib/ai";
import { extractJson } from "@/lib/experts/api";

export type Complete = (req: { system: string; messages: { role: "user"; content: string }[]; maxTokens: number }) => Promise<string>;

export const TERM_CATEGORIES = ["Industry", "Acronym", "Product", "Finance", "Legal", "Technical"] as const;
/** How much of one file the model reads. */
export const FILE_TEXT_LIMIT = 30_000;
/** Files older than this are not scanned by the scheduler sweep. */
export const SWEEP_DAYS = 30;
/** Files scanned per scheduler tick, to keep each tick short. */
export const SWEEP_LIMIT = 10;

const Reply = z.object({
  terms: z
    .array(
      z.object({
        term: z.string(),
        category: z.string().optional().default("Industry"),
        definition: z.string().optional().default(""),
      }),
    )
    .max(40),
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
    "You keep a case dictionary for a consulting team. From the document, pick the technical terms, industry jargon and acronyms a new team member would need explained, " +
    "that are not already in the dictionary. Skip everyday words, names of people, names of companies and clients, and project code names. " +
    `Define each in one plain sentence. Reply with JSON only: {"terms":[{"term":"","category":"${TERM_CATEGORIES.join("|")}","definition":""}]}. ` +
    'Write an acronym as "Full Name (ACRONYM)". Reply {"terms":[]} if nothing new.\n\n' +
    `Already in the dictionary: ${existing.join(", ") || "none"}`
  );
}

/** Keeps only well-formed terms that aren't already in the dictionary and don't name the client. */
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
    const existing = (await db.select({ term: glossaryTerms.term }).from(glossaryTerms).where(eq(glossaryTerms.engagementId, engagement.id))).map((r) => r.term);
    const run = complete ?? caseCompleter(db, engagement, src.uploadedBy);
    const reply = await run({
      system: buildTermPrompt(existing),
      messages: [{ role: "user", content: src.textBody.slice(0, FILE_TEXT_LIMIT) }],
      maxTokens: 2500,
    });
    // Read the list again: another file may have added terms while the model was working.
    const now = (await db.select({ term: glossaryTerms.term }).from(glossaryTerms).where(eq(glossaryTerms.engagementId, engagement.id))).map((r) => r.term);
    const fresh = pickNewTerms(extractJson(reply), now, blockedNames(engagement));
    if (fresh.length) await db.insert(glossaryTerms).values(fresh.map((t) => ({ engagementId: engagement.id, ...t, status: "active" as const })));
    return { added: fresh.length };
  } catch (err) {
    // Let the scheduler try again later.
    await db.update(sources).set({ termsScannedAt: null }).where(eq(sources.id, sourceId));
    throw err;
  }
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
