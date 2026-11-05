import { NextResponse, type NextRequest } from "next/server";

/**
 * When APP_URL points at a custom domain (e.g. https://merqado.ai), send visitors who arrive on
 * the Render address (*.onrender.com) to it. Sign-in cookies are per domain, so everyone must
 * use the same address for sign-in to complete.
 */
export function proxy(req: NextRequest) {
  const appUrl = process.env.APP_URL;
  if (!appUrl) return NextResponse.next();
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0]!.trim().toLowerCase();
  const target = new URL(appUrl);
  if (!host.endsWith(".onrender.com") || host === target.host) return NextResponse.next();
  const url = new URL(req.nextUrl.pathname + req.nextUrl.search, target);
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
