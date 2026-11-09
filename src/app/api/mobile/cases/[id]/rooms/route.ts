import { NextResponse } from "next/server";
import { loadChatList, loadPeople } from "@/lib/case/chat";
import { loadMembers } from "@/lib/case/page";
import { ROOM_TEMPLATES, roomMembersLabel } from "@/lib/case/rooms";
import { authorize } from "@/lib/experts/api";
import { allows } from "@/lib/roles";

/** Every chat I can see on a case (rooms, 1:1s, groups), with unread and mention counts. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id, "read");
  if (auth instanceof NextResponse) return auth;
  const people = await loadPeople(auth.db, await loadMembers(id, auth.user.firmId));
  const chats = await loadChatList(auth.db, id, auth.user, people);
  // A case with no rooms yet: offer the setup templates to whoever may create rooms.
  const canSetup = allows(auth.membership, "edit_findings");
  const templates = canSetup ? ROOM_TEMPLATES.map((t) => ({ name: t.name, who: roomMembersLabel(JSON.stringify(t.archetypes)) })) : [];
  return NextResponse.json({ chats, people, canSetup, templates });
}
