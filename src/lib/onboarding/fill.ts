import { z } from "zod";
import { extractJson } from "@/lib/experts/api";
import type { Onboarding } from "./model";

/** Documents sent to the model, at most this many characters in total. */
export const FILL_CHAR_BUDGET = 60_000;

export const FILL_SYSTEM = `You set up a new consulting case from its documents (statement of work, proposal, kickoff notes).
Pull out what the team needs to brief expert networks. Reply with one JSON object and nothing else:
{"market": "", "objective": "", "weeks": "", "startsOn": "", "endsOn": "", "geography": "", "doNotContactExtra": "",
 "angles": [{"name": "", "n": "", "who": "", "companies": "", "roles": "", "screeners": ""}]}
Rules:
- Leave a field "" when the documents don't say. Never guess.
- market: the market studied, lower case, short (e.g. "specialty medical tubing").
- objective: a few words (e.g. "Commercial due diligence").
- weeks: a number only. startsOn/endsOn: M/D (e.g. "8/31").
- doNotContactExtra: companies or people the documents say must not be contacted, beyond the client itself.
- Refer to the client company as "{client}", never by name. Keep other companies as written.
- angles: the types of people to interview (e.g. customers, competitors, former employees). n is the target count (e.g. "~20").
  who: one line. companies: comma list. roles: one per line. screeners: one question per line.`;

const str = z.string().catch("").default("");
const fillSchema = z.object({
  market: str,
  objective: str,
  weeks: str,
  startsOn: str,
  endsOn: str,
  geography: str,
  doNotContactExtra: str,
  angles: z
    .array(z.object({ name: str, n: str, who: str, companies: str, roles: str, screeners: str }))
    .catch([])
    .default([]),
});

/** Joins document texts under the budget, sharing it evenly so no single file crowds out the rest. */
export function fillPrompt(docs: { filename: string; text: string }[]): string {
  const withText = docs.filter((d) => d.text.trim());
  const each = Math.floor(FILL_CHAR_BUDGET / Math.max(1, withText.length));
  return withText.map((d) => `=== ${d.filename} ===\n${d.text.slice(0, each)}`).join("\n\n");
}

/** Parses the model's reply into fields for mergeFill. Bad replies give an empty fill. */
export function parseFill(reply: string, clientNames: string[] = []): Partial<Onboarding> {
  let raw: unknown;
  try {
    raw = extractJson(reply);
  } catch {
    return {};
  }
  const r = fillSchema.safeParse(raw);
  if (!r.success) return {};
  // Belt and braces: the client's name never lands in the form, even if the model slips.
  const names = clientNames.map((n) => n.trim()).filter((n) => n.length >= 3);
  const scrub = (s: string) => names.reduce((acc, n) => acc.replace(new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "{client}"), s.trim());
  const d = r.data;
  return {
    market: scrub(d.market),
    objective: scrub(d.objective),
    weeks: d.weeks.replace(/[^\d.]/g, ""),
    startsOn: d.startsOn.trim(),
    endsOn: d.endsOn.trim(),
    geography: scrub(d.geography),
    doNotContactExtra: scrub(d.doNotContactExtra),
    angles: d.angles
      .filter((a) => a.name.trim())
      .slice(0, 8)
      .map((a) => ({ id: "", name: scrub(a.name), n: a.n.trim(), who: scrub(a.who), companies: scrub(a.companies), roles: scrub(a.roles), screeners: scrub(a.screeners) })),
  };
}
