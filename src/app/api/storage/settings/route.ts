import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { getSessionUser } from "@/lib/session";
import { clearFirmStorage, firmStorage, updateFirmStorage } from "@/lib/storage/connections";
import { folderIdFromLink, refreshAccessToken } from "@/lib/storage/providers/gdrive";

const Op = z.discriminatedUnion("op", [z.object({ op: z.literal("root"), link: z.string().trim().min(1, "Paste a folder link.").max(500) }), z.object({ op: z.literal("disconnect") })]);

/** Firm admins choose the Drive folder for cases, or stop using Drive for new files. */
export async function POST(req: Request) {
  const db = getDb();
  const user = await getSessionUser(db);
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Only firm admins can change storage." }, { status: 403 });
  const parsed = Op.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the form." }, { status: 400 });
  const op = parsed.data;

  if (op.op === "disconnect") {
    await clearFirmStorage(db, user.firmId);
    return NextResponse.json({ ok: true });
  }

  const current = await firmStorage(db, user.firmId);
  if (current?.config.kind !== "gdrive") return NextResponse.json({ error: "Connect Google Drive first." }, { status: 400 });
  const folderId = folderIdFromLink(op.link);
  if (!folderId) return NextResponse.json({ error: "That isn't a Google Drive folder link." }, { status: 400 });
  const token = await refreshAccessToken(current.config.refreshToken);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?supportsAllDrives=true&fields=id,name,mimeType`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const f = (await res.json().catch(() => ({}))) as { name?: string; mimeType?: string };
  if (!res.ok || f.mimeType !== "application/vnd.google-apps.folder") return NextResponse.json({ error: "Couldn't open that folder with this Google account." }, { status: 400 });
  await updateFirmStorage(db, user.firmId, current.id, { ...current.config, rootFolderId: folderId, rootName: f.name ?? "Folder" });
  return NextResponse.json({ ok: true });
}
