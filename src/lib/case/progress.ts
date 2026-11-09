import type { TaskStatus } from "@/db/schema";

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  not_yet: "Not started",
  in_progress: "Started",
  almost_done: "Ready for review",
  done: "Done",
};

const WEIGHT: Record<TaskStatus, number> = { not_yet: 0, in_progress: 1 / 3, almost_done: 2 / 3, done: 1 };

/** Share of a module's work done, 0 to 100, counting partly done tasks. */
export function progressPct(tasks: { status: TaskStatus }[]): number {
  if (tasks.length === 0) return 0;
  return Math.round((tasks.reduce((a, t) => a + WEIGHT[t.status], 0) / tasks.length) * 100);
}

/** Where a date falls between the case start and end, 0 to 100. */
export function timelinePct(date: string, start: string, end: string): number {
  const d = Date.parse(date), s = Date.parse(start), e = Date.parse(end);
  if (!Number.isFinite(d) || !Number.isFinite(s) || !Number.isFinite(e) || e <= s) return 0;
  return Math.max(0, Math.min(100, ((d - s) / (e - s)) * 100));
}

export function todayIso(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** "2026-10-01" as "Oct 1". */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
