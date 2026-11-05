import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { beginSignIn, findConnectionForEmail, FLOW_COOKIE, FLOW_TTL_SECONDS } from "@/lib/auth/oidc";
import { cookieOptions, safeReturnTo } from "@/lib/auth/session";
import { appBaseUrl, CALLBACK_PATH } from "@/lib/auth/url";

/** Step 1: the person enters a work email; we send them to their firm's identity provider. */
export async function POST(req: Request) {
  const base = appBaseUrl(req);
  const form = await req.formData().catch(() => null);
  const email = String(form?.get("email") ?? "").trim().toLowerCase();
  const returnTo = safeReturnTo(form?.get("returnTo"));
  const back = (error: string) =>
    NextResponse.redirect(`${base}/login?error=${error}&email=${encodeURIComponent(email)}`, 303);

  if (!email.includes("@")) return back("email");
  const conn = await findConnectionForEmail(getDb(), email);
  if (!conn) return back("no_connection");

  try {
    const { url, flowCookie } = await beginSignIn(conn, {
      redirectUri: `${base}${CALLBACK_PATH}`,
      returnTo,
      loginHint: email,
    });
    const res = NextResponse.redirect(url, 303);
    res.cookies.set(FLOW_COOKIE, flowCookie, cookieOptions(FLOW_TTL_SECONDS, "/api/auth"));
    return res;
  } catch (err) {
    console.error("SSO start failed", conn.id, err);
    return back("idp_unreachable");
  }
}
