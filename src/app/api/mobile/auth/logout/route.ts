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
  if (user && typeof body.deviceToken === "string") {
    await db.delete(pushDevices).where(and(eq(pushDevices.userId, user.id), eq(pushDevices.token, body.deviceToken)));
  }
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  await destroySession(db, bearer);
  return NextResponse.json({ ok: true });
}
