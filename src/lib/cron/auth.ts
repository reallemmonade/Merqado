import { createHash, timingSafeEqual } from "node:crypto";

export const CRON_SECRET_HEADER = "x-cron-secret";

/** True when the request carries the CRON_SECRET. Always false when CRON_SECRET isn't set. */
export function cronAuthorized(headers: Headers, secret = process.env.CRON_SECRET): boolean {
  const given = headers.get(CRON_SECRET_HEADER);
  if (!secret || secret.length < 16 || !given) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}
