import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { cookieOptions, safeReturnTo } from "@/lib/auth/session";
import { appBaseUrl } from "@/lib/auth/url";
import { beginGmailLink, GMAIL_COOKIE } from "@/lib/mail/gmail";
import { getSessionUser } from "@/lib/session";

/** Links the signed-in person's Gmail so new inbox mail shows in Needs you. Headers only. */
export async function GET(req: Request) {
  const base = appBaseUrl(req);
  const returnTo = safeReturnTo(new URL(req.url).searchParams.get("returnTo") ?? "/settings");
  const user = await getSessionUser(getDb());
  if (!user) return NextResponse.redirect(`${base}/login?returnTo=${encodeURIComponent(returnTo)}`, 303);
  try {
    const { url, cookie, maxAge } = beginGmailLink({ base, userId: user.id, email: user.email, returnTo });
    const res = NextResponse.redirect(url, 303);
    res.cookies.set(GMAIL_COOKIE, cookie, cookieOptions(maxAge, "/api/storage"));
    return res;
  } catch {
    return NextResponse.redirect(`${base}${returnTo}?gmail=setup`, 303);
  }
}
