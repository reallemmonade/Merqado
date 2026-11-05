import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { sources } from "@/db/schema";
import { can } from "@/lib/roles";
import { getEngagementAccess, getSessionUser } from "@/lib/session";
import { resolveStorage } from "@/lib/storage";

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

  const { storage, connectionId } = await resolveStorage(
    db,
    user.firmId,
    membership.engagement.storageConnectionId,
  );
  const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 200) || "upload";
  const key = `engagements/${id}/${crypto.randomUUID()}/${safeName}`;
  await storage.put(key, new Uint8Array(await file.arrayBuffer()), file.type || undefined);

  const [row] = await db
    .insert(sources)
    .values({
      engagementId: id,
      storageConnectionId: connectionId,
      objectKey: key,
      filename: file.name,
      mimeType: file.type || null,
      sizeBytes: file.size,
      uploadedBy: user.id,
    })
    .returning();
  return NextResponse.json({ source: row }, { status: 201 });
}
