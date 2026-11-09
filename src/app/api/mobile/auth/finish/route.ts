import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { mobileAuthCodes } from "@/db/schema";
import { hashToken } from "@/lib/auth/session";
import { appBaseUrl } from "@/lib/auth/url";
import { getSessionUser } from "@/lib/session";

/** The iPhone app's custom URL scheme; iOS hands this redirect back to the app. */
export const APP_REDIRECT = "merqado://auth";
const CODE_TTL_MS = 2 * 60 * 1000;

/**
 * The iPhone app opens /login?returnTo=/api/mobile/auth/finish?challenge=… in a secure sign-in
 * sheet. After the normal Google / Microsoft sign-in lands here, we hand the app a one-time code.
 */
export async function GET(req: Request) {
  const base = appBaseUrl(req);
  const url = new URL(req.url);
  const challenge = url.searchParams.get("challenge") ?? "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(challenge)) return NextResponse.redirect(`${APP_REDIRECT}?error=bad_request`, 303);

  const db = getDb();
  const user = await getSessionUser(db);
  if (!user) {
    const returnTo = `/api/mobile/auth/finish?challenge=${challenge}`;
    return NextResponse.redirect(`${base}/login?returnTo=${encodeURIComponent(returnTo)}`, 303);
  }
  const code = randomBytes(32).toString("base64url");
  await db.insert(mobileAuthCodes).values({
    codeHash: hashToken(code),
    challenge,
    userId: user.id,
    firmId: user.firmId,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });
  return NextResponse.redirect(`${APP_REDIRECT}?code=${code}`, 303);
}
