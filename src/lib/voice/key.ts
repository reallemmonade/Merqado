import { eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { users } from "@/db/schema";
import { decryptJson, encryptJson } from "@/lib/crypto";

/** The person's own OpenAI key, decrypted, or null when they haven't added one. */
export async function userOpenAIKey(db: DB, userId: string): Promise<string | null> {
  const [row] = await db.select({ enc: users.encryptedOpenaiKey }).from(users).where(eq(users.id, userId));
  if (!row?.enc) return null;
  try {
    return decryptJson<string>(row.enc);
  } catch {
    return null;
  }
}

export async function setUserOpenAIKey(db: DB, userId: string, key: string | null) {
  await db
    .update(users)
    .set({ encryptedOpenaiKey: key ? encryptJson(key) : null })
    .where(eq(users.id, userId));
}

/** Shape check only; the route also asks OpenAI whether the key works. */
export function looksLikeOpenAIKey(v: unknown): v is string {
  return typeof v === "string" && /^sk-[A-Za-z0-9_-]{20,}$/.test(v.trim());
}

/** Last four characters, for showing which key is saved. */
export const keyTail = (k: string) => k.slice(-4);
