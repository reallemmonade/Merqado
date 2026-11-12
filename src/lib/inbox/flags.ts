/** No movement for this many days marks an open task or review as idle. */
export const IDLE_DAYS = 7;

const DAY = 24 * 60 * 60 * 1000;

export type TaskFlag = { flag: "overdue" | "idle"; days: number };

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY);
}

/**
 * Overdue when its due date (or its milestone's) is before today in the person's zone;
 * otherwise idle when nothing changed on it for IDLE_DAYS or more.
 */
export function taskFlag(t: { due: string | null; changedAt: Date }, now: Date, today: string): TaskFlag | null {
  if (t.due && t.due < today) return { flag: "overdue", days: daysBetween(t.due, today) };
  const days = Math.floor((now.getTime() - t.changedAt.getTime()) / DAY);
  return days >= IDLE_DAYS ? { flag: "idle", days } : null;
}

export function flagLabel(f: TaskFlag): string {
  return `${f.flag === "overdue" ? "Overdue" : "Idle"} ${f.days}d`;
}
