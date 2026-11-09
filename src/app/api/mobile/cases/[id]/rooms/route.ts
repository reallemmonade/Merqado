import { NextResponse } from "next/server";
import { loadChatList, loadPeople } from "@/lib/case/chat";
import { loadMembers } from "@/lib/case/page";
import { authorize } from "@/lib/experts/api";

/** Every chat I can see on a case (rooms, 1:1s, groups), with unread and mention counts. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id, "read");
  if (auth instanceof NextResponse) return auth;
  const people = await loadPeople(auth.db, await loadMembers(id, auth.user.firmId));
  const chats = await loadChatList(auth.db, id, auth.user, people);
  return NextResponse.json({ chats, people });
}
