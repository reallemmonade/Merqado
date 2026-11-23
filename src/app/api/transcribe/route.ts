import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getDb } from "@/db/client";
import { getSessionUser } from "@/lib/session";

/**
 * Speech to text for apps without a built-in recognizer (the desktop app).
 * Off until OPENAI_TRANSCRIBE_KEY is set on the server; nothing is sent anywhere before then.
 */
const KEY = () => process.env.OPENAI_TRANSCRIBE_KEY ?? "";
const MAX_BYTES = 10 * 1024 * 1024;

export async function GET() {
  return NextResponse.json({ enabled: KEY() !== "" });
}

export async function POST(req: Request) {
  if (!KEY()) return NextResponse.json({ error: "Off" }, { status: 503 });
  const user = await getSessionUser(getDb());
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof File) || audio.size === 0) return NextResponse.json({ error: "No audio." }, { status: 400 });
  if (audio.size > MAX_BYTES) return NextResponse.json({ error: "Too long." }, { status: 413 });
  const client = new OpenAI({ apiKey: KEY() });
  const res = await client.audio.transcriptions.create({ file: audio, model: "gpt-4o-mini-transcribe" });
  return NextResponse.json({ text: res.text.trim() });
}
