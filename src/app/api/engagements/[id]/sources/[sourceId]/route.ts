import { NextResponse } from "next/server";
import { authorize } from "@/lib/experts/api";
import { fileResponse, findSource, readSourceFile } from "@/lib/storage/files";

/** Opens (or downloads) the original file behind a source. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; sourceId: string }> }) {
  const { id, sourceId } = await params;
  const auth = await authorize(id, "read");
  if (auth instanceof NextResponse) return auth;
  const source = await findSource(auth.db, id, sourceId);
  if (!source) return NextResponse.json({ error: "File not found." }, { status: 404 });
  try {
    return fileResponse(await readSourceFile(auth.db, auth.user.firmId, source), source.filename, source.mimeType);
  } catch (err) {
    console.error("source download failed", err);
    return NextResponse.json({ error: "Couldn't open that file from storage." }, { status: 502 });
  }
}
