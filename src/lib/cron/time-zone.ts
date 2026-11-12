/** Time zone used when we haven't seen a person's browser yet. */
export const DEFAULT_TIME_ZONE = "UTC";

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export type LocalTime = {
  /** YYYY-MM-DD in that zone. */
  date: string;
  hour: number;
  minute: number;
  /** 0 = Sunday ... 6 = Saturday. */
  weekday: number;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** What the wall clock says for `at` in `tz` (falls back to UTC for a missing or bad zone). */
export function localTime(at: Date, tz: string | null | undefined): LocalTime {
  const zone = isValidTimeZone(tz) ? tz : DEFAULT_TIME_ZONE;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: WEEKDAYS.indexOf(parts.weekday ?? ""),
  };
}
