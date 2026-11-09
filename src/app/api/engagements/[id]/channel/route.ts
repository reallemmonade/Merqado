import { NextResponse } from "next/server";
import { and, eq, inArray, isNull, max, or, sql } from "drizzle-orm";
import { z } from "zod";
import { ARCHETYPES, PRESENCE_STATUSES, caseNotes, chatMessages, chatReactions, chatReads, chatRooms, sources, users } from "@/db/schema";
import { fileSources } from "@/lib/files/intake";
import { notFoundJson, ok, parseOp } from "@/lib/case/api";
import { loadMembers } from "@/lib/case/page";
import { canSeeChat, findMentions, parseIds, ROOM_TEMPLATES, sameMembers } from "@/lib/case/rooms";
import { notifyLater } from "@/lib/push/notify";
import { allows } from "@/lib/roles";
import { getEngagementAccess } from "@/lib/session";

const ref = z.string().min(1).max(64);
const link = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || /^https:\/\/\S+$/i.test(v), "Use an https:// link.")
  .optional();

const Op = z.discriminatedUnion("op", [
  z.object({ op: z.literal("rooms.setup"), names: z.array(z.string().max(100)).min(1, "Pick at least one chat.") }),
  z.object({ op: z.literal("room.add"), name: z.string().trim().min(1, "Add a name.").max(100), archetypes: z.array(z.enum(ARCHETYPES)).min(1, "Pick who's in it.") }),
  z.object({ op: z.literal("room.delete"), id: ref }),
  z.object({ op: z.literal("chat.open"), userIds: z.array(ref).min(1, "Pick someone.").max(50), name: z.string().trim().max(100).optional() }),
  z.object({ op: z.literal("chat.rename"), id: ref, name: z.string().trim().max(100) }),
  z.object({ op: z.literal("chat.add"), id: ref, userIds: z.array(ref).min(1).max(50) }),
  z.object({ op: z.literal("chat.leave"), id: ref }),
  z.object({ op: z.literal("message.post"), roomId: ref, body: z.string().trim().max(8000), parentId: ref.optional(), sourceIds: z.array(ref).max(20).optional() }),
  z.object({ op: z.literal("message.edit"), id: ref, body: z.string().trim().min(1, "Write a message.").max(8000) }),
  z.object({ op: z.literal("file.place"), sourceId: ref, folder: z.string().trim().min(1, "Pick a folder.").max(250) }),
  z.object({ op: z.literal("message.pin"), id: ref, pinned: z.boolean() }),
  z.object({ op: z.literal("message.delete"), id: ref }),
  z.object({ op: z.literal("reaction.toggle"), id: ref, emoji: z.string().min(1).max(16) }),
  z.object({ op: z.literal("read"), roomId: ref }),
  z.object({
    op: z.literal("meeting.add"),
    roomId: ref,
    title: z.string().trim().min(1, "Add a title.").max(200),
    startsAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Pick a time."),
    minutes: z.number().int().min(5).max(600),
    link,
  }),
  z.object({ op: z.literal("call.start"), roomId: ref, video: z.boolean(), link }),
  z.object({ op: z.literal("call.end"), id: ref }),
  z.object({ op: z.literal("presence.set"), status: z.enum(PRESENCE_STATUSES) }),
  z.object({ op: z.literal("ping") }),
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

  /** A chat on this case that this person can see. */
  async function room(roomId: string) {
    const row = await db.query.chatRooms.findFirst({ where: and(eq(chatRooms.id, roomId), eq(chatRooms.engagementId, id)) });
    return row && canSeeChat(row, user) ? row : null;
  }
  async function message(messageId: string) {
    const row = await db.query.chatMessages.findFirst({ where: and(eq(chatMessages.id, messageId), eq(chatMessages.engagementId, id)) });
    if (!row) return null;
    const rm = await room(row.roomId);
    return rm ? { row, room: rm } : null;
  }
  /** People on the case who can see this chat, for @mentions. */
  async function audience(chat: NonNullable<Awaited<ReturnType<typeof room>>>) {
    const members = await loadMembers(id, user.firmId);
    return members.filter((m) => canSeeChat(chat, m));
  }
  /** iPhone notifications: @mentions anywhere, and every message in a 1:1 or group chat. */
  function notifyMessage(chat: NonNullable<Awaited<ReturnType<typeof room>>>, mentions: string[], body: string) {
    const direct = chat.kind === "room" ? [] : parseIds(chat.memberIds);
    const to = [...new Set([...mentions, ...direct])].filter((u) => u !== user.id);
    if (!to.length) return;
    notifyLater(db, to, {
      title: chat.kind === "room" ? `${user.name} · ${chat.name}` : user.name,
      body: (body || "Sent a file").slice(0, 300),
      threadId: `room-${chat.id}`,
      category: "MESSAGE",
      data: { url: `/case/${id}/room/${chat.id}`, caseId: id, roomId: chat.id },
    });
  }
  const now = () => new Date();
  const markRead = (roomId: string) =>
    db
      .insert(chatReads)
      .values({ roomId, userId: user.id, lastReadAt: now() })
      .onConflictDoUpdate({ target: [chatReads.roomId, chatReads.userId], set: { lastReadAt: now() } });

  switch (op.op) {
    case "rooms.setup": {
      const picked = ROOM_TEMPLATES.filter((t) => op.names.includes(t.name));
      if (picked.length === 0) return NextResponse.json({ error: "Pick at least one chat." }, { status: 400 });
      const existing = await db.select({ name: chatRooms.name }).from(chatRooms).where(and(eq(chatRooms.engagementId, id), eq(chatRooms.kind, "room")));
      const have = new Set(existing.map((e) => e.name));
      const rows = picked.filter((t) => !have.has(t.name)).map((t, i) => ({ engagementId: id, name: t.name, archetypes: JSON.stringify(t.archetypes), createdBy: user.id, sort: existing.length + i }));
      if (rows.length) await db.insert(chatRooms).values(rows);
      return ok();
    }
    case "room.add": {
      const [m] = await db.select({ n: max(chatRooms.sort) }).from(chatRooms).where(eq(chatRooms.engagementId, id));
      const [row] = await db.insert(chatRooms).values({ engagementId: id, name: op.name, archetypes: JSON.stringify(op.archetypes), createdBy: user.id, sort: (m?.n ?? 0) + 1 }).returning();
      return ok({ id: row!.id });
    }
    case "room.delete":
      await db.delete(chatRooms).where(and(eq(chatRooms.id, op.id), eq(chatRooms.engagementId, id), eq(chatRooms.kind, "room")));
      return ok();
    case "chat.open": {
      const members = await loadMembers(id, user.firmId);
      const onCase = new Set(members.map((m) => m.id));
      const people = [...new Set([user.id, ...op.userIds])];
      if (people.some((p) => !onCase.has(p))) return NextResponse.json({ error: "Pick people on this case." }, { status: 400 });
      if (people.length < 2) return NextResponse.json({ error: "Pick someone." }, { status: 400 });
      const kind = people.length === 2 ? "dm" : "group";
      if (!op.name) {
        const mine = await db.select().from(chatRooms).where(and(eq(chatRooms.engagementId, id), eq(chatRooms.kind, kind)));
        const existing = mine.find((c) => sameMembers(parseIds(c.memberIds), people) && (kind === "dm" || c.name === ""));
        if (existing) return ok({ id: existing.id });
      }
      const [row] = await db.insert(chatRooms).values({ engagementId: id, kind, name: kind === "group" ? (op.name ?? "") : "", memberIds: JSON.stringify(people), createdBy: user.id }).returning();
      return ok({ id: row!.id });
    }
    case "chat.rename": {
      const chat = await room(op.id);
      if (!chat || chat.kind !== "group") return notFoundJson();
      await db.update(chatRooms).set({ name: op.name }).where(eq(chatRooms.id, chat.id));
      return ok();
    }
    case "chat.add": {
      const chat = await room(op.id);
      if (!chat || chat.kind === "room") return notFoundJson();
      const onCase = new Set((await loadMembers(id, user.firmId)).map((m) => m.id));
      if (op.userIds.some((p) => !onCase.has(p))) return NextResponse.json({ error: "Pick people on this case." }, { status: 400 });
      const people = [...new Set([...parseIds(chat.memberIds), ...op.userIds])];
      if (chat.kind === "dm") {
        // Adding someone to a 1:1 starts a new group, like Teams; the 1:1 history stays private.
        const [row] = await db.insert(chatRooms).values({ engagementId: id, kind: "group", name: "", memberIds: JSON.stringify(people), createdBy: user.id }).returning();
        return ok({ id: row!.id });
      }
      await db.update(chatRooms).set({ memberIds: JSON.stringify(people) }).where(eq(chatRooms.id, chat.id));
      return ok({ id: chat.id });
    }
    case "chat.leave": {
      const chat = await room(op.id);
      if (!chat || chat.kind !== "group") return notFoundJson();
      await db.update(chatRooms).set({ memberIds: JSON.stringify(parseIds(chat.memberIds).filter((u) => u !== user.id)) }).where(eq(chatRooms.id, chat.id));
      return ok();
    }
    case "message.post": {
      const chat = await room(op.roomId);
      if (!chat) return notFoundJson();
      const ids = op.sourceIds ?? [];
      if (!op.body && !ids.length) return NextResponse.json({ error: "Write a message." }, { status: 400 });
      if (op.parentId) {
        const parent = await db.query.chatMessages.findFirst({ where: and(eq(chatMessages.id, op.parentId), eq(chatMessages.roomId, chat.id)) });
        if (!parent || parent.parentId) return notFoundJson();
      }
      const mentions = op.body ? findMentions(op.body, await audience(chat)) : [];
      const [row] = await db
        .insert(chatMessages)
        .values({ roomId: chat.id, engagementId: id, userId: user.id, body: op.body, parentId: op.parentId ?? null, mentions: JSON.stringify(mentions) })
        .returning();
      if (ids.length) {
        // Files this person just attached in this chat join the message.
        await db
          .update(sources)
          .set({ messageId: row!.id })
          .where(and(eq(sources.engagementId, id), eq(sources.roomId, chat.id), eq(sources.uploadedBy, user.id), isNull(sources.messageId), inArray(sources.id, ids)));
      }
      await markRead(chat.id);
      notifyMessage(chat, mentions, op.body);
      return ok({ id: row!.id });
    }
    case "message.edit": {
      const found = await message(op.id);
      if (!found) return notFoundJson();
      if (found.row.userId !== user.id || found.row.kind !== "text") return NextResponse.json({ error: "You can only edit your own messages." }, { status: 403 });
      const mentions = findMentions(op.body, await audience(found.room));
      await db.update(chatMessages).set({ body: op.body, mentions: JSON.stringify(mentions), editedAt: now() }).where(eq(chatMessages.id, op.id));
      return ok();
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
      // Pins from rooms also land in Notes; 1:1 and group chats stay private.
      if (op.pinned && !found.row.pinned && found.room.kind === "room" && found.row.body) {
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
      await db.delete(chatMessages).where(or(eq(chatMessages.id, op.id), eq(chatMessages.parentId, op.id)));
      return ok();
    }
    case "reaction.toggle": {
      const found = await message(op.id);
      if (!found) return notFoundJson();
      const key = and(eq(chatReactions.messageId, op.id), eq(chatReactions.userId, user.id), eq(chatReactions.emoji, op.emoji));
      const had = await db.select({ e: chatReactions.emoji }).from(chatReactions).where(key);
      if (had.length) await db.delete(chatReactions).where(key);
      else await db.insert(chatReactions).values({ messageId: op.id, userId: user.id, emoji: op.emoji });
      return ok();
    }
    case "read": {
      if (!(await room(op.roomId))) return notFoundJson();
      await markRead(op.roomId);
      await db.update(users).set({ lastSeenAt: now() }).where(eq(users.id, user.id));
      return ok();
    }
    case "meeting.add": {
      const chat = await room(op.roomId);
      if (!chat) return notFoundJson();
      const meta = { title: op.title, startsAt: new Date(op.startsAt).toISOString(), minutes: op.minutes, link: op.link || null };
      const [row] = await db.insert(chatMessages).values({ roomId: chat.id, engagementId: id, userId: user.id, body: "", kind: "meeting", meta: JSON.stringify(meta) }).returning();
      return ok({ id: row!.id });
    }
    case "call.start": {
      const chat = await room(op.roomId);
      if (!chat) return notFoundJson();
      const meta = { video: op.video, link: op.link || null, endedAt: null };
      const [row] = await db.insert(chatMessages).values({ roomId: chat.id, engagementId: id, userId: user.id, body: "", kind: "call", meta: JSON.stringify(meta) }).returning();
      await markRead(chat.id);
      return ok({ id: row!.id });
    }
    case "call.end": {
      const found = await message(op.id);
      if (!found || found.row.kind !== "call") return notFoundJson();
      await db
        .update(chatMessages)
        .set({ meta: sql`json_set(${chatMessages.meta}, '$.endedAt', ${now().toISOString()})` })
        .where(eq(chatMessages.id, op.id));
      return ok();
    }
    case "presence.set":
      await db.update(users).set({ presence: op.status, lastSeenAt: now() }).where(eq(users.id, user.id));
      return ok();
    case "ping":
      await db.update(users).set({ lastSeenAt: now() }).where(eq(users.id, user.id));
      return ok();
  }
}
