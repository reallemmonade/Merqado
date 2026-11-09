import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { chatRooms } from "@/db/schema";
import { canSeeChat } from "@/lib/case/rooms";
import { authorize } from "@/lib/experts/api";
import { intakeFile } from "@/lib/files/intake";

const MAX_BYTES = 100 * 1024 * 1024;

/**
 * Takes in one file, dropped on Files or attached in a chat. It waits as "pending" with
 * suggested folders until someone confirms where it goes. An exact copy of a file already
 * in the case is not stored again.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const form = await req.formData().catch(() => null);
  const roomId = typeof form?.get("roomId") === "string" ? String(form!.get("roomId")) : "";
  // Anyone in a chat can share a file there; adding to Files needs upload rights.
  const auth = await authorize(id, roomId ? "read" : "upload");
  if (auth instanceof NextResponse) return auth;

  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Attach a file." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Files are limited to 100 MB." }, { status: 413 });

  if (roomId) {
    const room = await auth.db.query.chatRooms.findFirst({ where: and(eq(chatRooms.id, roomId), eq(chatRooms.engagementId, id)) });
    if (!room || !canSeeChat(room, auth.user)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const str = (k: string) => (typeof form?.get(k) === "string" ? String(form!.get(k)).slice(0, 500) : null);

  try {
    const res = await intakeFile(auth, { file, relPath: str("relPath"), batchId: str("batchId"), roomId: roomId || null });
    const s = res.source;
    return NextResponse.json(
      { duplicate: res.duplicate, source: { id: s.id, filename: s.filename, folder: s.folder, filing: s.filing, suggestions: JSON.parse(s.suggestions) } },
      { status: res.duplicate ? 200 : 201 },
    );
  } catch (err) {
    console.error("source upload failed", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload failed." }, { status: 400 });
  }
}
