import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getDb } from "@/db/client";
import { getSessionUser } from "@/lib/session";
import { keyTail, looksLikeOpenAIKey, setUserOpenAIKey } from "@/lib/voice/key";

/** Saves the caller's own OpenAI key after checking it with OpenAI (a free call). */
export async function POST(req: Request) {
  const db = getDb();
  const user = await getSessionUser(db);
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { key?: unknown } | null;
  if (!looksLikeOpenAIKey(body?.key)) return NextResponse.json({ error: "Not an OpenAI key." }, { status: 400 });
  const key = body.key.trim();
  const ok = await new OpenAI({ apiKey: key }).models
    .list()
    .then(() => true)
    .catch(() => false);
  if (!ok) return NextResponse.json({ error: "OpenAI rejected this key." }, { status: 400 });
  await setUserOpenAIKey(db, user.id, key);
  return NextResponse.json({ tail: keyTail(key) });
}

export async function DELETE() {
  const db = getDb();
  const user = await getSessionUser(db);
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  await setUserOpenAIKey(db, user.id, null);
  return NextResponse.json({ ok: true });
}
