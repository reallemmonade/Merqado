import { localTime } from "@/lib/cron/time-zone";

export const SNOOZE_CHOICES = ["hour", "tomorrow", "monday"] as const;
export type SnoozeChoice = (typeof SNOOZE_CHOICES)[number];

export const SNOOZE_LABELS: Record<SnoozeChoice, string> = { hour: "1 hour", tomorrow: "Tomorrow 08:30", monday: "Monday 08:30" };

const MORNING = { hour: 8, minute: 30 };
const DAY = 24 * 60 * 60 * 1000;

/** The instant the wall clock in `tz` reads `date` (YYYY-MM-DD) at hour:minute. */
export function zonedInstant(date: string, hour: number, minute: number, tz: string | null | undefined): Date {
  const [y, m, d] = date.split("-").map(Number);
  const want = Date.UTC(y!, m! - 1, d!, hour, minute);
  let guess = want;
  // Two passes settle the zone offset, including across a daylight-saving change.
  for (let i = 0; i < 2; i++) {
    const seen = localTime(new Date(guess), tz);
    const [sy, sm, sd] = seen.date.split("-").map(Number);
    guess += want - Date.UTC(sy!, sm! - 1, sd!, seen.hour, seen.minute);
  }
  return new Date(guess);
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

/** When a snooze picked at `now` ends, in the person's time zone. */
export function snoozeUntil(choice: SnoozeChoice, now: Date, tz: string | null | undefined): Date {
  if (choice === "hour") return new Date(now.getTime() + 60 * 60 * 1000);
  const today = localTime(now, tz);
  // Next Monday; on a Monday, the one a week out.
  const days = choice === "tomorrow" ? 1 : ((8 - today.weekday) % 7 || 7);
  const at = zonedInstant(addDays(today.date, days), MORNING.hour, MORNING.minute, tz);
  return at.getTime() > now.getTime() ? at : new Date(now.getTime() + DAY);
}
