/**
 * Plain calculations behind the Experts tab: anonymized titles, honoraria, coverage
 * and the case budget projection. No database access here, so it is easy to test.
 */

export type Status = "proposed" | "approved" | "scheduled" | "completed" | "declined";

/** Minutes assumed for a call that hasn't happened and has no length entered. */
export const DEFAULT_CALL_MINUTES = 60;

const LEVELS: [RegExp, string][] = [
  [/\b(chief\b[\w\s]*officer|ceo|cfo|coo|cto|cio|cmo|cpo)\b/i, "C-suite"],
  [/\b(evp|executive vice president)\b/i, "EVP"],
  [/\b(svp|senior vice president)\b/i, "SVP"],
  [/(?<!vice )\bpresident\b/i, "President"],
  [/\b(vp|vice president)\b/i, "VP"],
  [/\bmanaging director\b/i, "Managing Director"],
  [/\bsenior director\b/i, "Senior Director"],
  [/\bdirector\b/i, "Director"],
  [/\bhead\b/i, "Head of Department"],
  [/\b(founder|co-founder)\b/i, "Founder"],
  [/\bowner\b/i, "Owner"],
  [/\bpartner\b/i, "Partner"],
  [/\bprincipal\b/i, "Principal"],
  [/\bsenior manager\b/i, "Senior Manager"],
  [/\bmanager\b/i, "Manager"],
];

/** "Senior Director, Commercial Strategy" at Apple → "Apple, Senior Director". */
export function anonymizeTitle(company: string, title: string, isFormer = false): string {
  const cleanTitle = title.trim();
  const former = isFormer || /^(former|ex-)\s*/i.test(cleanTitle);
  const withoutFormer = cleanTitle.replace(/^(former|ex-)\s*/i, "");
  let level = LEVELS.find(([re]) => re.test(withoutFormer))?.[1];
  if (!level) {
    // Unknown title: keep its first part ("Senior Buyer, Polymers" → "Senior Buyer").
    level = withoutFormer.split(/,| of | - | – /i)[0]!.trim();
  }
  const co = company.trim();
  const parts = [co, level].filter(Boolean).join(", ");
  return former && parts ? `Former ${parts}` : parts;
}

export interface MinutesAndRate {
  status: Status;
  callMinutes: number;
  followupMinutes: number;
  surveyMinutes: number;
  hourlyRate: number;
}

export function totalMinutes(e: MinutesAndRate): number {
  return e.callMinutes + e.followupMinutes + e.surveyMinutes;
}

/** True when the amount is real (call held); false when it's an estimate. */
export function isBilled(e: Pick<MinutesAndRate, "status">): boolean {
  return e.status === "completed";
}

/** Minutes used for pay: actual minutes once held, otherwise the planned (or default) length. */
export function payableMinutes(e: MinutesAndRate): number {
  if (isBilled(e)) return totalMinutes(e);
  return totalMinutes(e) || DEFAULT_CALL_MINUTES;
}

/** Honorarium in dollars: minutes ÷ 60 × hourly rate. Declined experts cost nothing. */
export function honorarium(e: MinutesAndRate): number {
  if (e.status === "declined") return 0;
  return (payableMinutes(e) / 60) * e.hourlyRate;
}

export const STATUS_ORDER: Status[] = ["proposed", "approved", "scheduled", "completed"];

export interface CoverageRow {
  completed: number;
  scheduled: number;
  approved: number;
  proposed: number;
  target: number;
}

export function coverage(statuses: Status[], target: number): CoverageRow {
  const row: CoverageRow = { completed: 0, scheduled: 0, approved: 0, proposed: 0, target };
  for (const s of statuses) if (s !== "declined") row[s] += 1;
  return row;
}

export interface BudgetInput {
  total: number;
  plannedInterviews: number;
  experts: MinutesAndRate[];
  expenses: { category: string; amount: number }[];
  /** 0–1: how far through the case we are. Null when the case dates aren't set. */
  elapsedShare: number | null;
}

export interface BudgetSummary {
  total: number;
  honorariaPaid: number;
  expenses: number;
  aiTools: number;
  spent: number;
  remaining: number;
  booked: number;
  proposed: number;
  futureInterviews: number;
  futureInterviewCost: number;
  futureExpenses: number;
  projected: number;
  averageHonorarium: number;
}

export function budgetSummary(input: BudgetInput): BudgetSummary {
  const live = input.experts.filter((e) => e.status !== "declined");
  const sum = (xs: MinutesAndRate[]) => xs.reduce((n, e) => n + honorarium(e), 0);
  const honorariaPaid = sum(live.filter((e) => e.status === "completed"));
  const booked = sum(live.filter((e) => e.status === "scheduled" || e.status === "approved"));
  const proposed = sum(live.filter((e) => e.status === "proposed"));
  const aiTools = input.expenses.filter((x) => x.category === "ai_tools").reduce((n, x) => n + x.amount, 0);
  const expenses = input.expenses.filter((x) => x.category !== "ai_tools").reduce((n, x) => n + x.amount, 0);
  const spent = honorariaPaid + expenses + aiTools;

  const averageHonorarium = live.length ? sum(live) / live.length : 0;
  const futureInterviews = Math.max(0, input.plannedInterviews - live.length);
  const futureInterviewCost = futureInterviews * averageHonorarium;

  // Dinners, cabs and AI keep going at the pace so far, if we know how far in we are.
  const share = input.elapsedShare;
  const futureExpenses = share && share > 0 && share < 1 ? ((expenses + aiTools) / share) * (1 - share) : 0;

  const projected = spent + booked + proposed + futureInterviewCost + futureExpenses;
  return {
    total: input.total,
    honorariaPaid,
    expenses,
    aiTools,
    spent,
    remaining: input.total - spent,
    booked,
    proposed,
    futureInterviews,
    futureInterviewCost,
    futureExpenses,
    projected,
    averageHonorarium,
  };
}

/** Share of the case elapsed between two ISO dates, or null if they're missing. */
export function elapsedShare(startsOn: string | null, endsOn: string | null, now = new Date()): number | null {
  if (!startsOn || !endsOn) return null;
  const a = Date.parse(startsOn);
  const b = Date.parse(endsOn);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return Math.min(1, Math.max(0, (now.getTime() - a) / (b - a)));
}

export function money(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

export function parseIdList(json: string | null | undefined): string[] {
  try {
    const v = JSON.parse(json ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** "2026-10-28" → "Oct 28". */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export const STATUS_LABEL: Record<Status, string> = {
  proposed: "Proposed",
  approved: "Approved",
  scheduled: "Scheduled",
  completed: "Completed",
  declined: "Passed",
};
