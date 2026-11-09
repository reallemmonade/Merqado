import { NextResponse } from "next/server";
import { and, desc, eq, gt } from "drizzle-orm";
import { chatMessages, chatRooms, users } from "@/db/schema";
import { canSeeRoom } from "@/lib/case/rooms";
import { authorize } from "@/lib/experts/api";
import { caseMembers, markRead, roomAudience } from "@/lib/mobile/data";

async function load(id: string, roomId: string) {
  const auth = await authorize(id, "read");
  if (auth instanceof NextResponse) return auth;
  const room = await auth.db.query.chatRooms.findFirst({ where: and(eq(chatRooms.id, roomId), eq(chatRooms.engagementId, id)) });
  if (!room || !canSeeRoom(room.archetypes, auth.user.archetype)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return { ...auth, room };
}

/** A chat's messages (the latest 200, or only those after ?after=<ISO time>) and who's in it. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; roomId: string }> }) {
  const { id, roomId } = await params;
  const r = await load(id, roomId);
  if (r instanceof NextResponse) return r;
  const { db, user, room } = r;
  const after = new URL(req.url).searchParams.get("after");
  const afterDate = after ? new Date(after) : null;
  const where = afterDate && !Number.isNaN(afterDate.getTime()) ? and(eq(chatMessages.roomId, roomId), gt(chatMessages.createdAt, afterDate)) : eq(chatMessages.roomId, roomId);
  const rows = await db
    .select({ id: chatMessages.id, body: chatMessages.body, pinned: chatMessages.pinned, at: chatMessages.createdAt, userId: chatMessages.userId, author: users.name })
    .from(chatMessages)
    .leftJoin(users, eq(users.id, chatMessages.userId))
    .where(where)
    .orderBy(desc(chatMessages.createdAt))
    .limit(200);
  const members = roomAudience(await caseMembers(db, id, user.firmId), room.archetypes);
  await markRead(db, user.id, roomId);
  return NextResponse.json({
    room: { id: room.id, name: room.name },
    members: members.map((m) => ({ id: m.id, name: m.name, title: m.title })),
    messages: rows
      .reverse()
      .map((m) => ({ id: m.id, body: m.body, pinned: m.pinned, at: m.at.toISOString(), userId: m.userId, author: m.author ?? "", mine: m.userId === user.id })),
  });
}

/** Marks the chat read. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string; roomId: string }> }) {
  const { id, roomId } = await params;
  const r = await load(id, roomId);
  if (r instanceof NextResponse) return r;
  await markRead(r.db, r.user.id, roomId);
  return NextResponse.json({ ok: true });
}

