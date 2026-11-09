import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { pushDevices } from "@/db/schema";
import { destroySession } from "@/lib/auth/session";
import { getSessionUser } from "@/lib/session";

/** Signs the iPhone out and stops its notifications. */
export async function POST(req: Request) {
  const db = getDb();
  const user = await getSessionUser(db);
  const body = (await req.json().catch(() => ({}))) as { deviceToken?: unknown };
  // The phone is signing out, so stop its notifications even if its session already expired.
  if (typeof body.deviceToken === "string") {
    const token = body.deviceToken.toLowerCase();
    await db.delete(pushDevices).where(user ? and(eq(pushDevices.userId, user.id), eq(pushDevices.token, token)) : eq(pushDevices.token, token));
  }
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  await destroySession(db, bearer);
  return NextResponse.json({ ok: true });
}
