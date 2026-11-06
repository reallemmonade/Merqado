/**
 * AI transcript cleaner, modeled on how call-intelligence tools like Junior work: keep the
 * verbatim upload, and produce a separate cleaned version with an LLM correction pass that
 * uses the case's own vocabulary (companies, people, topics) and full-call context.
 *
 * Guardrails: the model may only tidy, never summarize or add. Each section's output is
 * checked against its input length, and any section that looks wrong stays verbatim.
 */
import type { CompletionRequest, CompletionResult } from "@/lib/ai";

export const CHUNK_CHARS = 12_000;
export const FLAG_MARKER = "===FLAGS===";

export interface CleanFlag {
  quote: string;
  reason: string;
}

/** Splits on paragraph breaks into pieces of at most ~maxChars, never mid-paragraph unless one paragraph is huge. */
export function chunkTranscript(text: string, maxChars = CHUNK_CHARS): string[] {
  const paras = text.split(/\n{2,}|\n(?=\S)/);
  const chunks: string[] = [];
  let cur = "";
  for (const p of paras) {
    if (p.length > maxChars) {
      if (cur) chunks.push(cur);
      cur = "";
      for (let i = 0; i < p.length; i += maxChars) chunks.push(p.slice(i, i + maxChars));
      continue;
    }
    if (cur && cur.length + p.length + 2 > maxChars) {
      chunks.push(cur);
      cur = "";
    }
    cur = cur ? `${cur}\n\n${p}` : p;
  }
  if (cur.trim()) chunks.push(cur);
  return chunks;
}

/** Splits a cleaner reply into the cleaned text and its flags. */
export function parseCleanerReply(reply: string): { text: string; flags: CleanFlag[] } {
  const at = reply.indexOf(FLAG_MARKER);
  const text = (at >= 0 ? reply.slice(0, at) : reply).trim();
  const flags =
    at >= 0
      ? reply
          .slice(at + FLAG_MARKER.length)
          .split("\n")
          .map((l) => l.replace(/^[-*\s]+/, "").trim())
          .filter((l) => l && !/^none\.?$/i.test(l))
          .map((l) => {
            const [quote, ...rest] = l.split(" | ");
            return { quote: (quote ?? "").replace(/^"|"$/g, "").trim(), reason: rest.join(" | ").trim() || "Check this" };
          })
          .filter((f) => f.quote)
      : [];
  return { text, flags };
}

/** Cleaned text should be shorter (fillers gone) but not wildly so; otherwise something was dropped or invented. */
export function looksSafe(original: string, cleaned: string): boolean {
  if (!cleaned.trim()) return false;
  const ratio = cleaned.length / Math.max(1, original.length);
  return ratio >= 0.4 && ratio <= 1.2;
}

export function cleanerSystemPrompt(glossary: string[]): string {
  return [
    "You clean expert-call transcripts for a management consulting team. You tidy; you never summarize, add, or infer.",
    "Rules:",
    "- Keep every substantive statement, number, unit, date and hedge (e.g. 'roughly', 'I think'). Do not change meaning.",
    "- Remove filler words (um, uh, like, you know, sort of), false starts, stutters, repeated words and crosstalk fragments.",
    "- Fix obvious speech-to-text errors in company names, people, products, technical terms and figures, using the glossary and the whole conversation. If unsure, keep the original wording and add [unclear].",
    "- Label speakers consistently as 'Interviewer:' and 'Expert:' (use 'Interviewer 2:' etc. for more people). One paragraph per turn. Keep a leading timestamp like [06:40] when the source has one.",
    "- Replace the expert's own name with 'Expert'. Remove phone numbers and email addresses.",
    "- Collapse greetings and small talk into a single line '[Small talk removed]'. Keep the compliance reminder, shortened to one line.",
    `After the cleaned text, write a line ${FLAG_MARKER} and then one line per item a reviewer should check, formatted 'short quote | reason': possible material non-public or confidential information about the expert's employer, figures you could not make sense of, or anything marked [unclear]. Write nothing after ${FLAG_MARKER} if there is nothing to flag.`,
    "",
    "Glossary of names and terms used on this case:",
    glossary.length ? glossary.map((g) => `- ${g}`).join("\n") : "- (none)",
  ].join("\n");
}

export type Complete = (req: CompletionRequest) => Promise<CompletionResult>;

/** Cleans a whole transcript section by section, carrying the tail of the previous section for speaker context. */
export async function cleanTranscriptWithAI(
  verbatim: string,
  glossary: string[],
  complete: Complete,
): Promise<{ text: string; flags: CleanFlag[]; keptVerbatim: number }> {
  const system = cleanerSystemPrompt(glossary);
  const chunks = chunkTranscript(verbatim);
  const out: string[] = [];
  const flags: CleanFlag[] = [];
  let keptVerbatim = 0;
  for (const [i, chunk] of chunks.entries()) {
    const previous = out.at(-1)?.slice(-800);
    const content = [
      chunks.length > 1 ? `This is section ${i + 1} of ${chunks.length} of one call.` : "",
      previous ? `End of the previous cleaned section, for speaker context only (do not repeat it):\n${previous}\n` : "",
      "Section to clean:",
      chunk,
    ]
      .filter(Boolean)
      .join("\n");
    const result = await complete({ system, messages: [{ role: "user", content }], maxTokens: 8000 });
    const parsed = result.refused ? { text: "", flags: [] } : parseCleanerReply(result.text);
    if (looksSafe(chunk, parsed.text)) {
      out.push(parsed.text);
      flags.push(...parsed.flags);
    } else {
      out.push(chunk);
      keptVerbatim += 1;
      flags.push({ quote: chunk.slice(0, 80).replace(/\s+/g, " ") + "…", reason: "This section was left verbatim because the cleaned version didn't look right." });
    }
  }
  return { text: out.join("\n\n"), flags, keptVerbatim };
}
