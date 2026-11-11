/** Start of the time slot `now` falls in, for a job that runs every `everyMinutes` (UTC-aligned). */
export function slotStart(now: Date, everyMinutes: number): Date {
  if (!Number.isInteger(everyMinutes) || everyMinutes <= 0) throw new Error(`Bad job cadence: ${everyMinutes}`);
  const size = everyMinutes * 60_000;
  return new Date(Math.floor(now.getTime() / size) * size);
}

export function slotKey(now: Date, everyMinutes: number): string {
  return slotStart(now, everyMinutes).toISOString();
}
