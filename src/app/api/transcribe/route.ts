import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getDb } from "@/db/client";
import { getSessionUser } from "@/lib/session";
import { userOpenAIKey } from "@/lib/voice/key";

/**
 * Speech to text for apps without a built-in recognizer (the desktop app), billed to the
 * signed-in person's own OpenAI key. Off for anyone who hasn't added a key in Settings.
 */
const MAX_BYTES = 10 * 1024 * 1024;

export async function GET() {
  const db = getDb();
  const user = await getSessionUser(db);
  return NextResponse.json({ enabled: user ? (await userOpenAIKey(db, user.id)) !== null : false });
}

export async function POST(req: Request) {
  const db = getDb();
  const user = await getSessionUser(db);
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const key = await userOpenAIKey(db, user.id);
  if (!key) return NextResponse.json({ error: "Off" }, { status: 503 });
  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof File) || audio.size === 0) return NextResponse.json({ error: "No audio." }, { status: 400 });
  if (audio.size > MAX_BYTES) return NextResponse.json({ error: "Too long." }, { status: 413 });
  const res = await new OpenAI({ apiKey: key }).audio.transcriptions
    .create({ file: audio, model: "gpt-4o-mini-transcribe" })
    .catch(() => null);
  if (!res) return NextResponse.json({ error: "Transcription failed." }, { status: 502 });
  return NextResponse.json({ text: res.text.trim() });
}
