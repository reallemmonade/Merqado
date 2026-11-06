import { NextResponse } from "next/server";
import { expertTranscripts } from "@/db/schema";
import { authorize, badRequest } from "@/lib/experts/api";
import { findExpert } from "@/lib/experts/data";
import { cleanTranscript, MAX_TRANSCRIPT_BYTES, transcriptText } from "@/lib/experts/transcript-text";

/** Upload a transcript file (multipart "file") or pasted text ("text"), as the call or a follow-up. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; expertId: string }> }) {
  const { id, expertId } = await params;
  const auth = await authorize(id, "upload");
  if (auth instanceof NextResponse) return auth;
  const expert = await findExpert(auth.db, id, expertId);
  if (!expert) return NextResponse.json({ error: "Expert not found." }, { status: 404 });

  const form = await req.formData().catch(() => null);
  if (!form) return badRequest("Send the transcript as a form upload.");
  const kind = form.get("kind") === "followup" ? "followup" : "call";
  const file = form.get("file");
  const pasted = form.get("text");

  let body: string;
  let filename: string;
  try {
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_TRANSCRIPT_BYTES) return badRequest("That file is over 10 MB.");
      body = await transcriptText(file);
      filename = file.name;
    } else if (typeof pasted === "string" && pasted.trim()) {
      body = cleanTranscript(pasted);
      filename = `${expert.firstName} ${expert.lastName} (${kind === "call" ? "call" : "follow-up"}, pasted)`.trim();
    } else {
      return badRequest("Choose a file or paste the transcript text.");
    }
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "Couldn't read that file.");
  }
  if (!body) return badRequest("That transcript is empty.");

  const [row] = await auth.db
    .insert(expertTranscripts)
    .values({ expertId, engagementId: id, kind, filename, body, uploadedBy: auth.user.id })
    .returning({ id: expertTranscripts.id });
  return NextResponse.json({ id: row!.id });
}
