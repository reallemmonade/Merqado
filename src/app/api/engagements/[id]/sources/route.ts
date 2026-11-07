import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { can } from "@/lib/roles";
import { getEngagementAccess, getSessionUser } from "@/lib/session";
import { saveSourceFile } from "@/lib/storage/files";

const MAX_BYTES = 100 * 1024 * 1024;

/** Uploads a file into the firm's own storage and registers it in the data room. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const user = await getSessionUser(db);
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  const membership = await getEngagementAccess(db, user, id);
  if (!membership || !can(membership.access, "upload")) {
    return NextResponse.json({ error: "You can't upload to this engagement." }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Attach a file." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Files are limited to 100 MB." }, { status: 413 });

  try {
    const source = await saveSourceFile(db, {
      firmId: user.firmId,
      engagementId: id,
      storageConnectionId: membership.engagement.storageConnectionId,
      file,
      uploadedBy: user.id,
    });
    return NextResponse.json({ source }, { status: 201 });
  } catch (err) {
    console.error("source upload failed", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload failed." }, { status: 400 });
  }
}
