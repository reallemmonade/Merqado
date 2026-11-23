import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { gmailLinks, notifications } from "@/db/schema";
import { appBaseUrl } from "@/lib/auth/url";
import { getSessionUser } from "@/lib/session";

/** Stops email alerts for the signed-in person and clears the ones still open. */
export async function POST(req: Request) {
  const db = getDb();
  const user = await getSessionUser(db);
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  await db.delete(gmailLinks).where(eq(gmailLinks.userId, user.id));
  await db.delete(notifications).where(and(eq(notifications.userId, user.id), eq(notifications.kind, "email")));
  return NextResponse.redirect(`${appBaseUrl(req)}/settings`, 303);
}
