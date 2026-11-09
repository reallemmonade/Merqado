import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { cookieOptions } from "@/lib/auth/session";
import { appBaseUrl } from "@/lib/auth/url";
import { getSessionUser } from "@/lib/session";
import { DRIVE_CALLBACK, DRIVE_STATE_COOKIE } from "@/lib/storage/providers/gdrive";


/** A firm admin connects the firm's Google Drive; Merqado then keeps case files there. */
export async function GET(req: Request) {
  const base = appBaseUrl(req);
  const user = await getSessionUser(getDb());
  if (!user) return NextResponse.redirect(`${base}/welcome`, 303);
  if (!user.isAdmin) return NextResponse.redirect(`${base}/settings/storage?error=admin`, 303);
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) return NextResponse.redirect(`${base}/settings/storage?error=setup`, 303);

  const state = randomBytes(24).toString("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${base}${DRIVE_CALLBACK}`,
    response_type: "code",
    scope: "openid email https://www.googleapis.com/auth/drive",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    login_hint: user.email,
    state,
  }).toString();
  const res = NextResponse.redirect(url.toString(), 303);
  res.cookies.set(DRIVE_STATE_COOKIE, state, cookieOptions(600, "/api/storage"));
  return res;
}
