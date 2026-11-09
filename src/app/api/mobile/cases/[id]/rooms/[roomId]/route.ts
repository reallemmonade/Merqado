import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { chatRooms } from "@/db/schema";
import { chatName, loadMessages, loadPeople } from "@/lib/case/chat";
import { loadMembers } from "@/lib/case/page";
import { canSeeChat, parseIds } from "@/lib/case/rooms";
import { authorize } from "@/lib/experts/api";
import { markRead } from "@/lib/mobile/data";

/** A chat's messages (or one thread's replies with ?thread=<id>) and who's in it. Opening it marks it read. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; roomId: string }> }) {
  const { id, roomId } = await params;
  const auth = await authorize(id, "read");
  if (auth instanceof NextResponse) return auth;
  const { db, user } = auth;
  const room = await db.query.chatRooms.findFirst({ where: and(eq(chatRooms.id, roomId), eq(chatRooms.engagementId, id)) });
  if (!room || !canSeeChat(room, user)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const people = await loadPeople(db, await loadMembers(id, user.firmId));
  const thread = new URL(req.url).searchParams.get("thread");
  const members = room.kind === "room" ? people.filter((p) => canSeeChat(room, p)) : people.filter((p) => parseIds(room.memberIds).includes(p.id));
  const nameOf = (uid: string) => people.find((p) => p.id === uid)?.name ?? "Former member";
  const [messages, parent] = await Promise.all([
    loadMessages(db, id, roomId, user, people, thread ? { parentId: thread } : {}),
    thread ? loadMessages(db, id, roomId, user, people, { ids: [thread] }) : Promise.resolve([]),
  ]);
  await markRead(db, user.id, roomId);
  return NextResponse.json({
    room: { id: room.id, kind: room.kind, name: chatName(room.kind, room.name, members.map((m) => m.id), user.id, nameOf) },
    members: members.map((m) => ({ id: m.id, name: m.name, title: m.title })),
    parent: parent[0] ?? null,
    messages,
  });
}
