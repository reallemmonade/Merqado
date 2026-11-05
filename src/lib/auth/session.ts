import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { sessions } from "@/db/schema";

export const SESSION_COOKIE = "mq_session";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function cookieOptions(maxAge: number, path = "/") {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path,
    maxAge,
  };
}

/** Creates a session and returns the raw token to set as a cookie. */
export async function createSession(
  db: DB,
  input: { userId: string; firmId: string; ssoConnectionId?: string },
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.insert(sessions).values({
    tokenHash: hashToken(token),
    userId: input.userId,
    firmId: input.firmId,
    ssoConnectionId: input.ssoConnectionId,
    expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
  });
  return token;
}

/** Returns the live session for a raw token, deleting it if expired. */
export async function findSession(db: DB, token: string | undefined) {
  if (!token) return null;
  const row = await db.query.sessions.findFirst({ where: eq(sessions.tokenHash, hashToken(token)) });
  if (!row) return null;
  if (row.expiresAt.getTime() <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, row.id));
    return null;
  }
  return row;
}

export async function destroySession(db: DB, token: string | undefined) {
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

/** Only allow same-site relative paths after sign-in. */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/";
  }
  return value;
}
