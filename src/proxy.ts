import { NextResponse, type NextRequest } from "next/server";
import { CASE_WRITE_HEADER, QUIET_HEADER, caseWriteTarget } from "@/lib/live/paths";

/**
 * - When APP_URL points at a custom domain (e.g. https://merqado.ai), send visitors who arrive on
 *   the Render address (*.onrender.com) to it. Sign-in cookies are per domain, so everyone must
 *   use the same address for sign-in to complete.
 * - Tag writes to a case so that, once they land, every open tab and device on that case reloads.
 */
export function proxy(req: NextRequest) {
  const appUrl = process.env.APP_URL;
  if (appUrl) {
    const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0]!.trim().toLowerCase();
    const target = new URL(appUrl);
    if (host.endsWith(".onrender.com") && host !== target.host) {
      const url = new URL(req.nextUrl.pathname + req.nextUrl.search, target);
      return NextResponse.redirect(url, 308);
    }
  }
  if (!req.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();
  const headers = new Headers(req.headers);
  headers.delete(CASE_WRITE_HEADER);
  const caseId = caseWriteTarget(req.method, req.nextUrl.pathname, headers.get(QUIET_HEADER) === "1");
  if (caseId) headers.set(CASE_WRITE_HEADER, caseId);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
