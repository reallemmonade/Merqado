import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { cookieOptions, safeReturnTo } from "@/lib/auth/session";
import { appBaseUrl } from "@/lib/auth/url";
import { beginLink, LINK_COOKIE } from "@/lib/meetings/link";
import { getSessionUser } from "@/lib/session";

/** Links the signed-in person's Microsoft account for Teams and Outlook meetings. ?basic=1 skips transcripts. */
export async function GET(req: Request) {
  const base = appBaseUrl(req);
  const params = new URL(req.url).searchParams;
  const returnTo = safeReturnTo(params.get("returnTo"));
  const user = await getSessionUser(getDb());
  if (!user) return NextResponse.redirect(`${base}/login?returnTo=${encodeURIComponent(returnTo)}`, 303);
  try {
    const { url, cookie, maxAge } = beginLink({ base, userId: user.id, email: user.email, returnTo, full: params.get("basic") !== "1" });
    const res = NextResponse.redirect(url, 303);
    res.cookies.set(LINK_COOKIE, cookie, cookieOptions(maxAge, "/api/auth"));
    return res;
  } catch {
    return NextResponse.redirect(`${base}${returnTo}?ms=setup`, 303);
  }
}
