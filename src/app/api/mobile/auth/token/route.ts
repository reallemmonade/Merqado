import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { mobileAuthCodes } from "@/db/schema";
import { createSession, hashToken, MOBILE_SESSION_TTL_SECONDS } from "@/lib/auth/session";

const Body = z.object({ code: z.string().min(20).max(200), verifier: z.string().min(43).max(128) });

/** The app trades its one-time code (plus the PKCE verifier only it knows) for a 30-day token. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Sign in again." }, { status: 400 });
  const db = getDb();
  const [row] = await db.delete(mobileAuthCodes).where(eq(mobileAuthCodes.codeHash, hashToken(parsed.data.code))).returning();
  const challenge = createHash("sha256").update(parsed.data.verifier).digest("base64url");
  if (!row || row.expiresAt.getTime() < Date.now() || row.challenge !== challenge) {
    return NextResponse.json({ error: "Sign in again." }, { status: 400 });
  }
  const token = await createSession(db, { userId: row.userId, firmId: row.firmId, ttlSeconds: MOBILE_SESSION_TTL_SECONDS });
  return NextResponse.json({ token, expiresAt: new Date(Date.now() + MOBILE_SESSION_TTL_SECONDS * 1000).toISOString() });
}
