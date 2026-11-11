import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { isValidTimeZone } from "@/lib/cron/time-zone";
import { getSessionUser } from "@/lib/session";

/** Saves the caller's time zone, sent quietly by the browser (see TimeZoneSync). */
export async function POST(req: Request) {
  const db = getDb();
  const user = await getSessionUser(db);
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { timeZone?: unknown } | null;
  if (!isValidTimeZone(body?.timeZone)) return NextResponse.json({ error: "Unknown time zone." }, { status: 400 });
  await db.update(users).set({ timeZone: body.timeZone }).where(eq(users.id, user.id));
  return NextResponse.json({ timeZone: body.timeZone });
}
