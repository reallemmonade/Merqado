/** What a calendar event offers for matching. */
export interface EventFacts {
  subject: string;
  /** Organizer and attendees, lowercase emails. */
  people: string[];
}

/** What a case offers for matching. */
export interface CaseFacts {
  engagementId: string;
  caseCode: string;
  /** The project code name, e.g. "Project Atlas". */
  projectName: string;
  /** The client's real name; never shown, only used to scrub titles. */
  clientName: string;
  /** Case team, lowercase emails. */
  team: string[];
  /** Experts on the case: their full name (to find) and code (to show). */
  experts: { name: string; label: string }[];
}

export interface Match {
  engagementId: string;
  matchedBy: string;
  score: number;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordRe = (s: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${esc(s.trim())}(?=$|[^\\p{L}\\p{N}])`, "iu");
const hasWord = (text: string, s: string) => s.trim().length >= 3 && wordRe(s).test(text);

/** "Project Atlas" -> "Atlas"; the bare code name is what people type in invites. */
function codeName(projectName: string): string {
  return projectName.replace(/^\s*project\s+/i, "").trim();
}

function isPlaceholder(name: string): boolean {
  const n = name.trim().toLowerCase();
  return n.length < 3 || n === "client";
}

/** Scores one event against one case; null when nothing ties them together. */
export function scoreCase(ev: EventFacts, c: CaseFacts): Match | null {
  const hits: Match[] = [];
  const add = (score: number, matchedBy: string) => hits.push({ engagementId: c.engagementId, score, matchedBy });
  if (c.caseCode && hasWord(ev.subject, c.caseCode)) add(100, "Case code in title");
  const code = codeName(c.projectName);
  if (code && (hasWord(ev.subject, c.projectName) || hasWord(ev.subject, code))) add(90, "Project name in title");
  if (c.experts.some((x) => x.name.includes(" ") && hasWord(ev.subject, x.name))) add(80, "Expert on case");
  const team = new Set(c.team);
  const overlap = new Set(ev.people.filter((p) => team.has(p))).size;
  if (team.size >= 2 && overlap >= 2 && overlap * 2 >= team.size) add(50 + overlap, `${overlap} of ${team.size} team`);
  return hits.sort((a, b) => b.score - a.score)[0] ?? null;
}

/** The case an event most likely belongs to, or null. */
export function matchEvent(ev: EventFacts, cases: CaseFacts[]): Match | null {
  let best: Match | null = null;
  for (const c of cases) {
    const m = scoreCase(ev, c);
    if (m && (!best || m.score > best.score)) best = m;
  }
  return best;
}

/** A title safe to show: the client's real name becomes "Client", expert names become their codes. */
export function cleanTitle(subject: string, c: Pick<CaseFacts, "clientName" | "experts">): string {
  let t = subject.replace(/\s+/g, " ").trim();
  if (!isPlaceholder(c.clientName)) t = t.replace(new RegExp(esc(c.clientName.trim()), "giu"), "Client");
  for (const x of c.experts) {
    if (x.name.includes(" ") && x.label) t = t.replace(new RegExp(esc(x.name.trim()), "giu"), x.label);
  }
  return t.slice(0, 200) || "Meeting";
}
