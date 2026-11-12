import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { mobileAuthCodes } from "@/db/schema";
import { findSession, hashToken, SESSION_COOKIE } from "@/lib/auth/session";
import { appBaseUrl } from "@/lib/auth/url";

/** The iPhone app's custom URL scheme; iOS hands this redirect back to the app. */
export const APP_REDIRECT = "merqado://auth";
const CODE_TTL_MS = 2 * 60 * 1000;
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

/** Only the browser sign-in cookie counts here, so a phone token can never mint another. */
async function browserSession() {
  const db = getDb();
  const jar = await cookies();
  return { db, session: await findSession(db, jar.get(SESSION_COOKIE)?.value) };
}

/**
 * The iPhone app opens /login?returnTo=/api/mobile/auth/finish?challenge=… in a secure sign-in
 * sheet. After the normal Google / Microsoft sign-in lands here, the person confirms, and the
 * POST below hands the app a one-time code. The confirm step stops a link from silently
 * issuing a code to whatever app claims the URL scheme.
 */
export async function GET(req: Request) {
  const base = appBaseUrl(req);
  const challenge = new URL(req.url).searchParams.get("challenge") ?? "";
  if (!CHALLENGE.test(challenge)) return NextResponse.redirect(`${APP_REDIRECT}?error=bad_request`, 303);
  const { session } = await browserSession();
  if (!session) {
    const returnTo = `/api/mobile/auth/finish?challenge=${challenge}`;
    return NextResponse.redirect(`${base}/login?returnTo=${encodeURIComponent(returnTo)}`, 303);
  }
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Merqado</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:Inter,-apple-system,system-ui,sans-serif;background:#f6f5f9;color:#1b1a22}
main{display:flex;flex-direction:column;align-items:center;gap:24px;padding:24px}h1{margin:0;font-size:24px;font-weight:600}
button{height:50px;padding:0 32px;border:0;border-radius:25px;background:#9a4a96;color:#fff;font:inherit;font-size:17px;font-weight:600}</style></head>
<body><main><h1>Open the Merqado app?</h1><form method="post"><input type="hidden" name="challenge" value="${challenge}"><button type="submit">Continue</button></form></main></body></html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY" } });
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const challenge = String(form?.get("challenge") ?? "");
  if (!CHALLENGE.test(challenge)) return NextResponse.redirect(`${APP_REDIRECT}?error=bad_request`, 303);
  const { db, session } = await browserSession();
  if (!session) return NextResponse.redirect(`${APP_REDIRECT}?error=signed_out`, 303);
  const code = randomBytes(32).toString("base64url");
  await db.insert(mobileAuthCodes).values({
    codeHash: hashToken(code),
    challenge,
    userId: session.userId,
    firmId: session.firmId,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });
  return NextResponse.redirect(`${APP_REDIRECT}?code=${code}`, 303);
}
