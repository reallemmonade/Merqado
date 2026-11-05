import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import {
  beginSignIn,
  findClaimedDomain,
  findConnectionForEmail,
  FLOW_COOKIE,
  FLOW_TTL_SECONDS,
  type SignInTarget,
} from "@/lib/auth/oidc";
import { isPlatformProvider, platformCredentials } from "@/lib/auth/platform";
import { cookieOptions, safeReturnTo } from "@/lib/auth/session";
import { appBaseUrl, CALLBACK_PATH } from "@/lib/auth/url";

/**
 * Step 1. Either the person clicked "Continue with Google/Microsoft" (provider is set), or
 * they typed a work email and we route them to their firm's own identity provider.
 */
export async function POST(req: Request) {
  const base = appBaseUrl(req);
  const form = await req.formData().catch(() => null);
  const email = String(form?.get("email") ?? "").trim().toLowerCase();
  const provider = form?.get("provider");
  const returnTo = safeReturnTo(form?.get("returnTo"));
  const back = (error: string) =>
    NextResponse.redirect(`${base}/login?error=${error}&email=${encodeURIComponent(email)}`, 303);

  let target: SignInTarget;
  if (isPlatformProvider(provider)) {
    if (!platformCredentials(provider)) return back("no_connection");
    target = { provider };
  } else {
    if (!email.includes("@")) return back("email");
    const db = getDb();
    const conn = await findConnectionForEmail(db, email);
    if (conn) target = { connection: conn };
    else return back((await findClaimedDomain(db, email)) ? "use_button" : "firm_not_found");
  }

  try {
    const { url, flowCookie } = await beginSignIn(target, {
      redirectUri: `${base}${CALLBACK_PATH}`,
      returnTo,
      loginHint: email.includes("@") ? email : "",
    });
    const res = NextResponse.redirect(url, 303);
    res.cookies.set(FLOW_COOKIE, flowCookie, cookieOptions(FLOW_TTL_SECONDS, "/api/auth"));
    return res;
  } catch (err) {
    console.error("SSO start failed", "connection" in target ? target.connection.id : target.provider, err);
    return back("idp_unreachable");
  }
}
