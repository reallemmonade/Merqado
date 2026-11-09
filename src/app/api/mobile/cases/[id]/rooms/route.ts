import { NextResponse } from "next/server";
import { authorize } from "@/lib/experts/api";
import { roomsFor } from "@/lib/mobile/data";

/** The team chats I can see on a case, with unread counts. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id, "read");
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ rooms: await roomsFor(auth.db, auth.user, id) });
}
