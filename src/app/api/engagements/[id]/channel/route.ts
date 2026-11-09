import { NextResponse } from "next/server";
import { and, eq, inArray, isNull, max } from "drizzle-orm";
import { z } from "zod";
import { ARCHETYPES, caseNotes, chatMessages, chatRooms, sources } from "@/db/schema";
import { fileSources } from "@/lib/files/intake";
import { notFoundJson, ok, parseOp } from "@/lib/case/api";
import { canSeeRoom, ROOM_TEMPLATES } from "@/lib/case/rooms";
import { allows } from "@/lib/roles";
import { getEngagementAccess } from "@/lib/session";

const ref = z.string().min(1).max(64);

const Op = z.discriminatedUnion("op", [
  z.object({ op: z.literal("rooms.setup"), names: z.array(z.string().max(100)).min(1, "Pick at least one chat.") }),
  z.object({ op: z.literal("room.add"), name: z.string().trim().min(1, "Add a name.").max(100), archetypes: z.array(z.enum(ARCHETYPES)).min(1, "Pick who's in it.") }),
  z.object({ op: z.literal("room.delete"), id: ref }),
  z.object({ op: z.literal("message.post"), roomId: ref, body: z.string().trim().max(8000), sourceIds: z.array(ref).max(20).optional() }),
  z.object({ op: z.literal("file.place"), sourceId: ref, folder: z.string().trim().min(1, "Pick a folder.").max(250) }),
  z.object({ op: z.literal("message.pin"), id: ref, pinned: z.boolean() }),
  z.object({ op: z.literal("message.delete"), id: ref }),
]);

const ROOM_OPS = new Set(["rooms.setup", "room.add", "room.delete"]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await parseOp(req, id, "read", Op);
  if (r instanceof NextResponse) return r;
  const { auth, op } = r;
  const { db, user } = auth;

  if (ROOM_OPS.has(op.op)) {
    const access = await getEngagementAccess(db, user, id);
    if (!allows(access, "edit_findings")) return NextResponse.json({ error: "You can't change this case's chats." }, { status: 403 });
  }

  /** A room on this case that this person's role can see. */
  async function room(roomId: string) {
    const row = await db.query.chatRooms.findFirst({ where: and(eq(chatRooms.id, roomId), eq(chatRooms.engagementId, id)) });
    return row && canSeeRoom(row.archetypes, user.archetype) ? row : null;
  }
  async function message(messageId: string) {
    const row = await db.query.chatMessages.findFirst({ where: and(eq(chatMessages.id, messageId), eq(chatMessages.engagementId, id)) });
    if (!row) return null;
    const rm = await room(row.roomId);
    return rm ? { row, room: rm } : null;
  }

  switch (op.op) {
    case "rooms.setup": {
      const picked = ROOM_TEMPLATES.filter((t) => op.names.includes(t.name));
      if (picked.length === 0) return NextResponse.json({ error: "Pick at least one chat." }, { status: 400 });
      const existing = await db.select({ name: chatRooms.name }).from(chatRooms).where(eq(chatRooms.engagementId, id));
      const have = new Set(existing.map((e) => e.name));
      const rows = picked.filter((t) => !have.has(t.name)).map((t, i) => ({ engagementId: id, name: t.name, archetypes: JSON.stringify(t.archetypes), sort: existing.length + i }));
      if (rows.length) await db.insert(chatRooms).values(rows);
      return ok();
    }
    case "room.add": {
      const [m] = await db.select({ n: max(chatRooms.sort) }).from(chatRooms).where(eq(chatRooms.engagementId, id));
      const [row] = await db.insert(chatRooms).values({ engagementId: id, name: op.name, archetypes: JSON.stringify(op.archetypes), sort: (m?.n ?? 0) + 1 }).returning();
      return ok({ id: row!.id });
    }
    case "room.delete":
      await db.delete(chatRooms).where(and(eq(chatRooms.id, op.id), eq(chatRooms.engagementId, id)));
      return ok();
    case "message.post": {
      if (!(await room(op.roomId))) return notFoundJson();
      const ids = op.sourceIds ?? [];
      if (!op.body && !ids.length) return NextResponse.json({ error: "Write a message." }, { status: 400 });
      const [row] = await db.insert(chatMessages).values({ roomId: op.roomId, engagementId: id, userId: user.id, body: op.body }).returning();
      if (ids.length) {
        // Files this person just attached in this room join the message.
        await db
          .update(sources)
          .set({ messageId: row!.id })
          .where(and(eq(sources.engagementId, id), eq(sources.roomId, op.roomId), eq(sources.uploadedBy, user.id), isNull(sources.messageId), inArray(sources.id, ids)));
      }
      return ok({ id: row!.id });
    }
    case "file.place": {
      const src = await db.query.sources.findFirst({ where: and(eq(sources.id, op.sourceId), eq(sources.engagementId, id)) });
      if (!src || !src.roomId || src.uploadedBy !== user.id || !(await room(src.roomId))) return notFoundJson();
      const access = await getEngagementAccess(db, user, id);
      if (!access) return notFoundJson();
      try {
        await fileSources({ db, user, engagement: access.engagement, membership: access }, [{ sourceId: src.id, folder: op.folder, asVersion: !!src.versionCandidate }]);
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Filing failed." }, { status: 502 });
      }
      return ok();
    }
    case "message.pin": {
      const found = await message(op.id);
      if (!found) return notFoundJson();
      await db.update(chatMessages).set({ pinned: op.pinned }).where(eq(chatMessages.id, op.id));
      if (op.pinned && !found.row.pinned) {
        await db.insert(caseNotes).values({
          engagementId: id,
          kind: "note",
          body: found.row.body,
          origin: found.room.name,
          link: `/e/${id}/channel?room=${found.room.id}#m-${found.row.id}`,
          createdBy: user.id,
        });
      }
      return ok();
    }
    case "message.delete": {
      const found = await message(op.id);
      if (!found) return notFoundJson();
      if (found.row.userId !== user.id) return NextResponse.json({ error: "You can only delete your own messages." }, { status: 403 });
      await db.delete(chatMessages).where(eq(chatMessages.id, op.id));
      return ok();
    }
  }
}
