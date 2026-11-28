import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { completeAndMeter, resolveProvider } from "@/lib/ai";
import { aiError } from "@/lib/experts/api";
import { extractText } from "@/lib/files/extract";
import { FILL_SYSTEM, fillPrompt, parseFill } from "@/lib/onboarding/fill";
import { getSessionUser } from "@/lib/session";

const MAX_FILES = 5;
const MAX_BYTES = 20 * 1024 * 1024;

/** Reads a SOW or other scope documents dropped in "+ New case" and fills the case fields. The case doesn't exist yet. */
export async function POST(req: Request) {
  const db = getDb();
  const user = await getSessionUser(db);
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const files = (form?.getAll("file") ?? []).filter((f): f is File => f instanceof File).slice(0, MAX_FILES);
  if (!files.length) return NextResponse.json({ error: "Attach a file." }, { status: 400 });
  if (files.some((f) => f.size > MAX_BYTES)) return NextResponse.json({ error: "Files are limited to 20 MB." }, { status: 413 });
  const codeName = typeof form?.get("codeName") === "string" ? String(form!.get("codeName")).slice(0, 200) : "";

  const docs = await Promise.all(files.map(async (f) => ({ filename: f.name, text: await extractText(f.name, new Uint8Array(await f.arrayBuffer())) })));
  const prompt = fillPrompt(docs);
  if (!prompt) return NextResponse.json({ fill: {}, read: 0 });
  try {
    const resolved = await resolveProvider(db, user.firmId, null);
    const result = await completeAndMeter(
      db,
      resolved,
      { system: FILL_SYSTEM, messages: [{ role: "user", content: prompt }], maxTokens: 2500 },
      { firmId: user.firmId, userId: user.id, feature: "onboarding_fill" },
    );
    if (result.refused) throw new Error("The model declined this request.");
    return NextResponse.json({ fill: parseFill(result.text, [codeName]), read: docs.filter((d) => d.text.trim()).length });
  } catch (err) {
    return aiError(err);
  }
}
