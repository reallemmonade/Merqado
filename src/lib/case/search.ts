/** A piece of case text that search and the case GPT can find. */
export interface Snippet {
  label: string;
  href: string;
  text: string;
  kind: "transcript" | "takeaway" | "note" | "chat" | "slide" | "term" | "hypothesis" | "task" | "file";
}

const STOP = new Set(
  "the a an and or of to in on for with about what which who how why when where is are was were be been do does did can could should would will from by at as it its this that these those we our you your they them their me my i not no any all more most than then there here into over under per vs give show find pull best".split(
    " ",
  ),
);

export function keywords(q: string): string[] {
  const words = q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}%$.\- ]/gu, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^[.\-]+|[.\-]+$/g, ""))
    .filter((w) => w.length >= 2 && !STOP.has(w));
  return [...new Set(words)];
}

/** Splits long text into paragraph-sized chunks so a hit points at the right place. */
export function chunk(text: string, max = 900): string[] {
  const paras = text.split(/\n\s*\n|\n(?=[A-Z][^\n]{0,40}:)/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (const p of paras) {
    if (cur && cur.length + p.length + 1 > max) {
      out.push(cur);
      cur = "";
    }
    if (p.length > max) {
      for (let i = 0; i < p.length; i += max) out.push(p.slice(i, i + max));
    } else cur = cur ? cur + "\n" + p : p;
  }
  if (cur) out.push(cur);
  return out;
}

export function score(text: string, words: string[]): number {
  const t = text.toLowerCase();
  let s = 0;
  let distinct = 0;
  for (const w of words) {
    let i = t.indexOf(w);
    if (i >= 0) distinct++;
    let n = 0;
    while (i >= 0 && n < 20) {
      n++;
      i = t.indexOf(w, i + w.length);
    }
    s += n;
  }
  return s + distinct * distinct * 3;
}

/** Best-matching snippets that fit a character budget. */
export function topSnippets(all: Snippet[], q: string, limit = 30, budget = 40000): Snippet[] {
  const words = keywords(q);
  const scored = all
    .map((s) => ({ s, n: words.length ? score(s.text, words) : 0 }))
    .filter((x) => x.n > 0 || words.length === 0)
    .sort((a, b) => b.n - a.n);
  const out: Snippet[] = [];
  let used = 0;
  for (const { s } of scored) {
    if (out.length >= limit) break;
    if (used + s.text.length > budget) continue;
    out.push(s);
    used += s.text.length;
  }
  return out;
}

/** Exact phrase matches for keyword search: count and a short excerpt around the first one. */
export function phraseHits(text: string, phrase: string): { count: number; before: string; match: string; after: string } | null {
  const p = phrase.trim().toLowerCase();
  if (!p) return null;
  const t = text.toLowerCase();
  let i = t.indexOf(p);
  if (i < 0) return null;
  const first = i;
  let count = 0;
  while (i >= 0) {
    count++;
    i = t.indexOf(p, i + p.length);
  }
  const start = Math.max(0, first - 90);
  const end = Math.min(text.length, first + p.length + 120);
  return {
    count,
    before: (start > 0 ? "…" : "") + text.slice(start, first).replace(/\s+/g, " "),
    match: text.slice(first, first + p.length),
    after: text.slice(first + p.length, end).replace(/\s+/g, " ") + (end < text.length ? "…" : ""),
  };
}

/** Splits an answer like "PVC is concentrated [2]." into text and citation parts. */
export function splitCitations(text: string): ({ text: string } | { cite: number })[] {
  const parts: ({ text: string } | { cite: number })[] = [];
  const re = /\[(\d{1,3})\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ cite: Number(m[1]) });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
