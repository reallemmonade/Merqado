/**
 * Temporary sign-in bypass. Off unless the owner sets all three env vars on a test copy:
 *
 *   SIGNIN_BYPASS_CODE="XXXX"          typed in the Work email box instead of an email
 *   SIGNIN_BYPASS_EMAIL="me@firm.com"  the existing user it signs in as (never a new account)
 *   SIGNIN_BYPASS_UNTIL="2026-12-01"   it stops working at this date, so it can't be left on
 *
 * It never creates users or firms, so it only reaches the data of the one user named.
 */
type Env = Record<string, string | undefined>;

export const BYPASS_MAX_DAYS = 14;

/** The email to sign in as when `typed` is the live bypass code, else null. */
export function bypassEmail(typed: string, env: Env = process.env, now = Date.now()): string | null {
  const code = env.SIGNIN_BYPASS_CODE?.trim();
  const as = env.SIGNIN_BYPASS_EMAIL?.trim().toLowerCase();
  const until = Date.parse(env.SIGNIN_BYPASS_UNTIL ?? "");
  if (!code || code.length < 4 || !as?.includes("@") || !Number.isFinite(until)) return null;
  if (now >= until || until - now > BYPASS_MAX_DAYS * 864e5) return null;
  return typed.trim().toLowerCase() === code.toLowerCase() ? as : null;
}
