import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { completeSignIn, FLOW_COOKIE, SignInError } from "@/lib/auth/oidc";
import { cookieOptions, createSession, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/auth/session";
import { appBaseUrl, CALLBACK_PATH } from "@/lib/auth/url";

/** Step 2: the identity provider sends the person back here with a one-time code. */
export async function GET(req: Request) {
  const base = appBaseUrl(req);
  const incoming = new URL(req.url);
  // Rebuild against the public URL so redirect_uri matches what we sent (Render sits behind a proxy).
  const callbackUrl = new URL(`${base}${CALLBACK_PATH}${incoming.search}`);
  const jar = await cookies();
  const db = getDb();

  const fail = (code: string) => {
    const res = NextResponse.redirect(`${base}/login?error=${code}`, 303);
    res.cookies.delete({ name: FLOW_COOKIE, path: "/api/auth" });
    return res;
  };

  if (incoming.searchParams.get("error")) return fail("idp_denied");

  try {
    const result = await completeSignIn(db, { flowCookie: jar.get(FLOW_COOKIE)?.value, callbackUrl });
    const token = await createSession(db, {
      userId: result.userId,
      firmId: result.firmId,
      ssoConnectionId: result.connectionId,
    });
    const res = NextResponse.redirect(`${base}${result.returnTo}`, 303);
    res.cookies.delete({ name: FLOW_COOKIE, path: "/api/auth" });
    res.cookies.set(SESSION_COOKIE, token, cookieOptions(SESSION_TTL_SECONDS));
    return res;
  } catch (err) {
    if (err instanceof SignInError) return fail(err.code);
    console.error("SSO callback failed", err);
    return fail("failed");
  }
}
