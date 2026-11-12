/**
 * Picks a folder for a file from its name, where it sat in a dropped folder, and its text.
 * Pure functions, so they're easy to test; the AI fallback lives in the upload route.
 */

export interface FileFacts {
  name: string;
  /** Path inside a dropped folder, including the file name, e.g. "Models - Working/OEM 01.xlsx". */
  relPath?: string | null;
  text?: string | null;
}

interface Rule {
  folder: string;
  /** Matched against the folder names a file sat in when dropped. */
  aliases: string[];
  /** Matched against the file name and dropped path. */
  name?: RegExp;
  /** Matched against the first part of the text. */
  text?: RegExp;
  ext?: RegExp;
}

const RULES: Rule[] = [
  { folder: "Admin/Compliance", aliases: ["compliance", "legal", "nda", "conflicts"], name: /\b(nda|compliance|conflict|engagement letter|sow\b|msa\b|consent)/i },
  { folder: "Admin/Expenses", aliases: ["expenses", "expense", "receipts", "invoices"], name: /\b(expense|receipt|invoice|honorari|reimburse)/i, text: /\b(receipt|invoice (number|no)|amount due|total due)\b/i },
  { folder: "Admin", aliases: ["admin", "administration", "case kick-off guide", "kickoff", "kick-off"], name: /\b(admin|kick.?off|staffing|onboarding|team list)/i },
  { folder: "Client/Data", aliases: ["data from client", "client data", "data", "uploads", "data room"], name: /\b(data cube|sales data|from client|upload|volume|revenue by|customer list|financials?)\b/i },
  { folder: "Client/Emails", aliases: ["email from client", "emails from client", "emails", "email", "correspondence"], ext: /\.(eml|msg)$/i, text: /^(from|to|subject|sent):/im },
  { folder: "Client", aliases: ["client"] },
  { folder: "Interviews/Guides", aliases: ["guides", "guide", "interview guides", "ivg"], name: /\b(ivg|interview guide|discussion guide|call guide|question(naire)?s?)\b|guide/i },
  {
    folder: "Interviews/Transcripts",
    aliases: ["transcripts", "interviews", "ivs", "ivs by segment", "write-ups", "write ups", "follow-up conversations", "written followups", "warm management calls", "calls", "expert calls"],
    name: /\b(transcript|interview|iv\b|ivs\b|expert call|call notes|write.?up|follow.?up|person \d+|oem \d+.*(head|manager|vp)|warm iv)/i,
    text: /\b(interviewer|expert|speaker \d|q:|a:)\b/i,
  },
  { folder: "Interviews", aliases: ["interviews", "wish list", "contact list", "candidates", "experts"], name: /\b(wish list|iv tracker|candidates|solicitation|expert network|contact list)/i },
  { folder: "Meetings/Recordings", aliases: ["recordings", "recording", "audio", "video"], ext: /\.(mp3|mp4|m4a|wav|mov|webm|ogg|aac)$/i },
  {
    folder: "Meetings/Transcripts",
    aliases: ["meeting transcripts", "meetings", "bod", "ctm", "eod", "client updates", "other internal", "steerco"],
    name: /\b(bod|ctm|eod|steerco|steering|board|client update|meeting|check.?in|readout|sync)\b/i,
  },
  { folder: "Models/Surveys", aliases: ["surveys", "survey"], name: /\b(survey|nps|kpc|npc|questionnaire responses)/i },
  { folder: "Models", aliases: ["models - working", "models", "model", "analysis", "oem share analysis", "teardown sow sizing", "triangulation"], name: /\b(model|analysis|sizing|triangulation|tagging|mapping|share|bottom.?up|top.?down|tam|sam)\b/i, ext: /\.(xlsx|xlsm|xls|csv)$/i },
  { folder: "Research", aliases: ["research", "public data", "purchased 3rd party data", "third party", "3rd party", "reports"], name: /\b(research|report|tracker|competitor|10-?k|annual report|press|article|industry|market data)\b/i },
  { folder: "Deliverables/Final", aliases: ["final deliverables", "final", "deliverables final"], name: /\b(final|sent|v_?final)\b/i },
  { folder: "Deliverables/Presentations", aliases: ["presentations - working", "presentations", "decks", "slides", "client memos", "memos"], name: /\b(deck|slides?|presentation|memo|readout|storyline)\b/i, ext: /\.(pptx?|key)$/i },
  { folder: "Workplan/Issue map", aliases: ["issue map", "issue tree"], name: /\b(issue (map|tree)|hypothes[ie]s tree|key questions)\b/i },
  { folder: "Workplan", aliases: ["work plan & issue map", "work plan and issue map", "workplan", "work plan"], name: /\b(work ?plan|gantt|timeline)\b/i },
  { folder: "Knowledge/LDK IP", aliases: ["ldk ip", "ip"] },
  { folder: "Knowledge", aliases: ["knowledge management", "knowledge", "reusable case prompts", "analysis scripts automations", "prompts", "templates"], name: /\b(prompt|template|approach|methodology|playbook|script)\b/i, ext: /\.(py|ipynb|r|sql)$/i },
  { folder: "Working", aliases: ["working", "scratch", "personal"] },
];

const norm = (s: string) => s.toLowerCase().replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();

export interface Suggestion {
  folder: string;
  score: number;
}

/** The folder a dropped-folder name stands for, among the case's folders, if any. */
export function folderForName(name: string, folders: string[]): string | null {
  const n = norm(name);
  const exact = folders.find((f) => norm(f.split("/").pop()!) === n || norm(f) === n);
  if (exact) return exact;
  const rule = RULES.find((r) => r.aliases.includes(n) && folders.includes(r.folder));
  return rule?.folder ?? null;
}

/** Folder ideas from the file's name and text, best first. */
export function scoreFolders(facts: FileFacts, folders: string[]): Suggestion[] {
  const label = norm(`${facts.relPath ?? ""} ${facts.name}`);
  const head = (facts.text ?? "").slice(0, 4000);
  const scores = new Map<string, number>();
  for (const r of RULES) {
    if (!folders.includes(r.folder)) continue;
    let s = 0;
    if (r.name?.test(label)) s += 3;
    if (r.ext?.test(facts.name)) s += 2;
    if (head && r.text?.test(head)) s += 1;
    if (s) scores.set(r.folder, Math.max(scores.get(r.folder) ?? 0, s));
  }
  return [...scores].map(([folder, score]) => ({ folder, score })).sort((a, b) => b.score - a.score);
}

/**
 * Suggested folders, best first (at most two). A file inside a dropped folder follows that
 * folder: "Models - Working/OEM deep dive/x.xlsx" goes to "Models/OEM deep dive". A dropped
 * folder that isn't one of ours becomes a subfolder of wherever its files belong.
 */
export function suggestFolders(facts: FileFacts, folders: string[]): { folders: string[]; sure: boolean } {
  const dirs = (facts.relPath ?? "").split("/").slice(0, -1).filter(Boolean);
  let mapped: string | null = null;
  const extra: string[] = [];
  for (const d of dirs) {
    const hit = folderForName(d, folders);
    if (!mapped) {
      if (hit) {
        mapped = hit;
        extra.length = 0;
      } else extra.push(d);
    } else if (hit && hit.startsWith(mapped + "/") && !extra.length) {
      mapped = hit;
    } else if (hit !== mapped) {
      extra.push(d);
    }
  }
  const scored = scoreFolders(facts, folders);
  if (mapped) {
    const sub = extra.length ? `${mapped}/${extra[0]}` : mapped;
    // A file whose own name points to a more specific child of the mapped folder goes there.
    // Only its own name and text count: the dropped folder's name alone would send every file
    // in an "Interviews" folder to Interviews/Transcripts.
    const child = scoreFolders({ ...facts, relPath: null }, folders).find((s) => s.folder.startsWith(mapped + "/"));
    const best = !extra.length && child ? child.folder : sub;
    return { folders: unique([best, ...scored.map((s) => s.folder)]).slice(0, 2), sure: true };
  }
  const list = scored.map((s) => s.folder);
  const top = scored[0];
  const sure = !!top && top.score >= 3 && (scored[1]?.score ?? 0) < top.score;
  if (extra.length && list[0]) {
    // The dropped folder itself is kept as a subfolder, e.g. "Models/OEM deep dive analysis".
    return { folders: unique([`${list[0]}/${extra[0]}`, list[0], ...list.slice(1)]).slice(0, 2), sure };
  }
  return { folders: list.slice(0, 2), sure };
}

const unique = (xs: string[]) => [...new Set(xs)];

/** A name with version marks removed, to spot a newer copy of an existing file. */
export function versionStem(filename: string): string {
  return filename
    .toLowerCase()
    .replace(/\.[a-z0-9]{1,5}$/, "")
    .replace(/\s*\(\d+\)$/, "")
    .replace(/[\s_-]*(copy|final|draft|sent|working)$/g, "")
    .replace(/[\s_-]*v(er(sion)?)?[\s_.-]?\d+([._]\d+)?$/g, "")
    .replace(/[\s_-]*(copy|final|draft|sent|working)$/g, "")
    .replace(/[\s_-]+/g, " ")
    .trim();
}

export interface CaseRef {
  kind: "expert";
  id: string;
  label: string;
  /** Strings that, found in a file name, mean the file is about this item. */
  keys: string[];
}

/** Case items (experts so far) whose code shows up in the file name or the start of its text. */
export function findLinks(facts: FileFacts, refs: CaseRef[]): { kind: string; id: string; label: string }[] {
  const hay = norm(`${facts.relPath ?? ""} ${facts.name}`);
  const out: { kind: string; id: string; label: string }[] = [];
  for (const r of refs) {
    if (r.keys.some((k) => k && new RegExp(`(^|[^a-z0-9])${escapeRe(norm(k))}($|[^a-z0-9])`).test(hay))) out.push({ kind: r.kind, id: r.id, label: r.label });
    if (out.length >= 3) break;
  }
  return out;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
