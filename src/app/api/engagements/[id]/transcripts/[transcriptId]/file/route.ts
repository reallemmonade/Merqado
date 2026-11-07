import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { expertTranscripts } from "@/db/schema";
import { authorize } from "@/lib/experts/api";
import { fileResponse, findSource, readSourceFile } from "@/lib/storage/files";

/**
 * Opens the file a transcript came from. When the original upload was kept, that file;
 * otherwise (pasted text, sample data, older uploads) the full verbatim text as a .txt file.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; transcriptId: string }> }) {
  const { id, transcriptId } = await params;
  const auth = await authorize(id, "read");
  if (auth instanceof NextResponse) return auth;
  const tr = await auth.db.query.expertTranscripts.findFirst({
    where: and(eq(expertTranscripts.id, transcriptId), eq(expertTranscripts.engagementId, id)),
  });
  if (!tr) return NextResponse.json({ error: "Transcript not found." }, { status: 404 });

  const source = tr.sourceId ? await findSource(auth.db, id, tr.sourceId) : undefined;
  if (source) {
    try {
      return fileResponse(await readSourceFile(auth.db, auth.user.firmId, source), source.filename, source.mimeType);
    } catch (err) {
      console.error("transcript original failed; falling back to text", err);
    }
  }
  const name = /\.(txt|md|vtt|srt)$/i.test(tr.filename) ? tr.filename : `${tr.filename.replace(/\.[^.]+$/, "")}.txt`;
  return fileResponse(new TextEncoder().encode(tr.body), name, "text/plain");
}
