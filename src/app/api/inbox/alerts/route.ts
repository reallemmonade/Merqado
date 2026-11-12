import { NextResponse } from "next/server";
import { and, desc, eq, gt, or } from "drizzle-orm";
import { notifications } from "@/db/schema";
import { rowText, webLink } from "@/lib/inbox/present";
import { mobileAuth } from "@/lib/mobile/data";
import { inboxViewWhere } from "@/lib/notifications/sync";

/** New and re-nudged Needs-you items since a time, for the desktop app's native notifications. */
export async function GET(req: Request) {
  const auth = await mobileAuth();
  if (auth instanceof NextResponse) return auth;
  const { db, user } = auth;
  const now = new Date();
  const raw = Date.parse(new URL(req.url).searchParams.get("since") ?? "");
  // Never look back more than an hour, so a long-closed laptop doesn't replay the day.
  const since = new Date(Math.max(Number.isFinite(raw) ? raw : now.getTime(), now.getTime() - 60 * 60 * 1000));
  const rows = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, user.id),
        inboxViewWhere("open", now),
        or(and(eq(notifications.status, "unread"), gt(notifications.createdAt, since)), gt(notifications.nudgedAt, since)),
      ),
    )
    .orderBy(desc(notifications.updatedAt))
    .limit(5);
  const alerts = rows.map((r) => {
    const data = JSON.parse(r.data || "{}") as Record<string, string>;
    const e = { kind: r.kind, title: r.title, body: r.body, caseId: r.engagementId, ...data };
    const { title, sub } = rowText(e);
    return { key: r.key, title, body: sub, href: webLink(e) };
  });
  return NextResponse.json({ alerts, now: now.toISOString() });
}
