/**
 * Cheap claim checking against cited sources, ported from agent-index (agent_index/verify.py, check_claim).
 *
 * Before an answer is shown, each sentence that cites a source is checked against the cited passage.
 * Numbers, rise/fall directions and names in the claim must be backed by the source; otherwise the
 * sentence is flagged. No second model call.
 */

const STOP = new Set(
  "a an the of to in on for and or but is are was were be been it its this that with as at by from has have had not no than then so".split(" "),
);
const NUM_WORDS: Record<string, string> = {};
"zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen"
  .split(" ")
  .forEach((w, i) => (NUM_WORDS[w] = String(i)));
Object.assign(NUM_WORDS, {
  twenty: "20", thirty: "30", forty: "40", fifty: "50", sixty: "60", seventy: "70", eighty: "80", ninety: "90",
  hundred: "100", thousand: "1000", million: "1000000",
});
const isNumWord = (w: string) => Object.prototype.hasOwnProperty.call(NUM_WORDS, w);
const lowerWords = (text: string) => text.toLowerCase().match(/[a-z]+/g) ?? [];

function numbers(text: string): Set<string> {
  const nums = new Set((text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, "")));
  for (const w of lowerWords(text)) if (isNumWord(w)) nums.add(NUM_WORDS[w]!);
  return nums;
}

function contentWords(text: string): Set<string> {
  const words = (text.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter((w) => !STOP.has(w) && !isNumWord(w));
  return new Set(words.map((w) => (w.endsWith("s") && w.length > 4 ? w.slice(0, -1) : w)));
}

/** Capitalized words that are not sentence starts. */
function names(text: string): Set<string> {
  return new Set(text.match(/(?<![.!?]\s)(?<!^)\b[A-Z][a-z]{2,}\b/g) ?? []);
}

/** Capitalized first words. Often names ("Microsoft reported..."), but also ordinary words. */
function sentenceStarts(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/(?:^|[.!?]\s+)([A-Z][A-Za-z]{2,})\b/g)) if (!STOP.has(m[1]!.toLowerCase())) out.add(m[1]!);
  return out;
}

const SCALE: Record<string, number> = { thousand: 1e3, k: 1e3, million: 1e6, mn: 1e6, m: 1e6, billion: 1e9, bn: 1e9, b: 1e9, trillion: 1e12, tn: 1e12 };
const QTY = /(\d[\d,]*(?:\.\d+)?)\s*(thousand|million|billion|trillion|mn|bn|tn|k|m|b)?\b/gi;

/** [as written, value with its scale word applied, rounding tolerance] for each number. */
function quantities(text: string): [string, number, number][] {
  const out: [string, number, number][] = [];
  for (const m of text.matchAll(QTY)) {
    const digits = m[1]!.replace(/,/g, "");
    const v = Number(digits);
    if (!Number.isFinite(v)) continue;
    const mult = m[2] ? (SCALE[m[2].toLowerCase()] ?? 1) : 1;
    // The claim's precision: "391 billion" is 391 +- 0.5 billion.
    const decimals = digits.includes(".") ? digits.split(".")[1]!.length : 0;
    out.push([digits, v * mult, 0.5 * 10 ** -decimals * mult]);
  }
  return out;
}

/** Numbers in the claim that the source doesn't state, allowing rounding and unit words ("$391 billion" matches "$391,035 million"). */
function missingNumbers(claim: string, source: string): Set<string> {
  const have = numbers(source);
  const src = quantities(source);
  const missing = new Set<string>();
  for (const [digits, value, tol] of quantities(claim)) {
    if (have.has(digits)) continue;
    if (!src.some(([, q]) => Math.abs(value - q) <= tol)) missing.add(digits);
  }
  // Spelled-out numbers ("thirteen") still count when the source has the digits.
  for (const w of lowerWords(claim)) if (isNumWord(w) && !have.has(NUM_WORDS[w]!)) missing.add(NUM_WORDS[w]!);
  return missing;
}

const UP = new Set("rose rise rises risen grew grow grows grown increased increase increases gained climbed jumped up higher expanded surged".split(" "));
const DOWN = new Set("fell fall falls fallen declined decline declines decreased decrease decreases dropped drop drops shrank shrunk down lower slipped slumped".split(" "));
const direction = (w: string) => (UP.has(w) ? 1 : DOWN.has(w) ? -1 : 0);

/** "Revenue rose" against a source saying "revenue declined": find what the claim says moved, then the nearest direction word after that subject in the source. */
function directionConflicts(claim: string, source: string): string[] {
  const cw = lowerWords(claim);
  const sw = lowerWords(source);
  const out: string[] = [];
  cw.forEach((w, i) => {
    const d = direction(w);
    if (!d || (i && ["not", "no", "never"].includes(cw[i - 1]!))) return;
    const subject = cw.slice(Math.max(0, i - 3), i).filter((x) => !STOP.has(x) && x.length > 2 && !direction(x));
    if (!subject.length) return;
    const last = subject[subject.length - 1]!;
    for (let j = 0; j < sw.length; j++) {
      if (sw[j] !== last) continue;
      const found = sw.slice(j + 1, j + 7).map(direction).find((x) => x) ?? 0;
      if (found === -d) {
        out.push(`source says ${last} moved the other way`);
        break;
      }
    }
  });
  return out;
}

export type Verdict = "supported" | "unsupported" | "unclear";
export interface ClaimCheck {
  verdict: Verdict;
  wordOverlap: number;
  problems: string[];
}

const sorted = (s: Set<string>) => JSON.stringify([...s].sort()).replace(/"/g, "'").replace(/,/g, ", ");

/** Return supported / unsupported / unclear, with the reasons. */
export function checkClaim(claim: string, source: string): ClaimCheck {
  const problems: string[] = [];
  const srcLower = source.toLowerCase();
  const missingNums = missingNumbers(claim, source);
  if (missingNums.size) problems.push(`numbers not in source: ${sorted(missingNums)}`);
  const missingNames = new Set([...names(claim)].filter((n) => !srcLower.includes(n.toLowerCase())));
  if (missingNames.size) problems.push(`names not in source: ${sorted(missingNames)}`);
  problems.push(...directionConflicts(claim, source));
  // A capitalized first word the source never uses may be a name ("Microsoft reported...").
  const maybeNames = new Set([...sentenceStarts(claim)].filter((n) => !srcLower.includes(n.toLowerCase()) && !missingNames.has(n)));
  const cw = contentWords(claim);
  const sw = contentWords(source);
  const overlap = [...cw].filter((w) => sw.has(w)).length / Math.max(1, cw.size);
  let verdict: Verdict;
  if (problems.length) verdict = "unsupported";
  else if (maybeNames.size) {
    verdict = "unclear";
    problems.push(`possible names not in source: ${sorted(maybeNames)}`);
  } else if (overlap >= 0.6) verdict = "supported";
  else {
    verdict = "unclear";
    problems.push(`only ${Math.round(overlap * 100)}% of the claim's words appear in the source`);
  }
  return { verdict, wordOverlap: Math.round(overlap * 100) / 100, problems };
}

// ---------- answers: check each citing sentence against the passages it cites ----------

export interface CitedSentence {
  /** Offset in the answer just after the sentence's last citation, where a marker goes. */
  at: number;
  claim: string;
  cites: number[];
}

/** Splits an answer into sentences and keeps the ones that cite a numbered source like [3]. */
export function citedSentences(text: string): CitedSentence[] {
  const out: CitedSentence[] = [];
  // A sentence ends at . ! ? followed by space or end (not "93.7"), plus any citations right after; or at a line break.
  const end = /[.!?](?=\s|$)((?:\s*\[\d{1,3}\])*)|\n/g;
  let start = 0;
  const push = (to: number) => {
    const raw = text.slice(start, to);
    const cites = [...raw.matchAll(/\[(\d{1,3})\]/g)].map((m) => Number(m[1]));
    if (cites.length) {
      const lastCite = raw.lastIndexOf("]");
      const claim = raw
        .replace(/\s*\[\d{1,3}\]/g, "")
        .replace(/[*_`]/g, "")
        .replace(/^\s*(?:[-•]|\d+[.)])\s+/, "")
        .trim();
      if (claim) out.push({ at: start + lastCite + 1, claim, cites: [...new Set(cites)] });
    }
    start = to;
  };
  for (const m of text.matchAll(end)) push(m.index! + m[0].length);
  if (start < text.length) push(text.length);
  return out;
}

export interface AnswerFlag {
  at: number;
  problems: string[];
}

/** Flags each citing sentence whose number, direction or name the cited passages don't support. */
export function checkAnswer(text: string, passages: Map<number, string>): AnswerFlag[] {
  const flags: AnswerFlag[] = [];
  for (const s of citedSentences(text)) {
    const source = s.cites.map((n) => passages.get(n)).filter(Boolean).join("\n");
    if (!source) continue;
    const r = checkClaim(s.claim, source);
    if (r.verdict === "unsupported") flags.push({ at: s.at, problems: r.problems });
  }
  return flags;
}
