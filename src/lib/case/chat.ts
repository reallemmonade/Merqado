import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { chatMessages, chatReactions, chatRooms, sources, users, type Archetype } from "@/db/schema";
import type { CaseMember } from "./page";
import { initials } from "./page";
import { canSeeChat, parseIds, presenceOf, roomMembersLabel, type Presence } from "./rooms";

export interface ChatPerson {
  id: string;
  name: string;
  initials: string;
  title: string;
  archetype: Archetype;
  presence: Presence;
}

export interface ChatListItem {
  id: string;
  kind: "room" | "dm" | "group";
  name: string;
  /** Who's in it: role label for rooms, names for chats. */
  sub: string;
  memberIds: string[];
  /** For a 1:1, the other person (avatar + presence). */
  otherId: string | null;
  last: { author: string; text: string; at: string } | null;
  lastAt: string | null;
  unread: number;
  mentioned: number;
}

export interface ChatFile {
  id: string;
  filename: string;
  folder: string;
  pending: boolean;
  mine: boolean;
  suggestions: string[];
  links: string[];
}

export interface ChatMsg {
  id: string;
  authorId: string | null;
  author: string;
  initials: string;
  at: string;
  body: string;
  kind: "text" | "meeting" | "call";
  meta: { title?: string; startsAt?: string; minutes?: number; link?: string | null; video?: boolean; endedAt?: string | null };
  pinned: boolean;
  mine: boolean;
  edited: boolean;
  mentionsMe: boolean;
  files: ChatFile[];
  reactions: { emoji: string; count: number; mine: boolean; names: string[] }[];
  replies: { count: number; lastAt: string | null; authors: string[] };
}

export interface SharedFile {
  id: string;
  filename: string;
  folder: string;
  pending: boolean;
  by: string;
  at: string;
}

const iso = (d: Date | null) => (d ? d.toISOString() : "");

function list(json: string): unknown[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function obj(json: string): ChatMsg["meta"] {
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/** Everyone on the case, with their presence dot. */
export async function loadPeople(db: DB, members: CaseMember[]): Promise<ChatPerson[]> {
  const ids = members.map((m) => m.id);
  const rows = ids.length ? await db.select({ id: users.id, lastSeenAt: users.lastSeenAt, presence: users.presence }).from(users).where(inArray(users.id, ids)) : [];
  const seen = new Map(rows.map((r) => [r.id, r]));
  return members.map((m) => {
    const s = seen.get(m.id);
    return { id: m.id, name: m.name, initials: initials(m.name), title: m.title, archetype: m.archetype, presence: presenceOf(s?.presence ?? "auto", s?.lastSeenAt ?? null) };
  });
}

/** Display name of a 1:1 or group chat from where the viewer sits. */
export function chatName(kind: string, name: string, memberIds: string[], meId: string, nameOf: (id: string) => string): string {
  if (kind === "room" || name) return name;
  const others = memberIds.filter((m) => m !== meId).map(nameOf);
  if (others.length === 0) return nameOf(meId);
  if (kind === "dm") return others[0]!;
  return others.length <= 3 ? others.join(", ") : `${others.slice(0, 2).join(", ")} +${others.length - 2}`;
}

/** The left-hand list: every chat this person can see, newest activity first within each group. */
export async function loadChatList(db: DB, engagementId: string, me: { id: string; archetype: Archetype }, people: ChatPerson[]): Promise<ChatListItem[]> {
  const rooms = (await db.select().from(chatRooms).where(eq(chatRooms.engagementId, engagementId)).orderBy(asc(chatRooms.sort), asc(chatRooms.createdAt))).filter((r) => canSeeChat(r, me));
  if (!rooms.length) return [];
  const ids = rooms.map((r) => r.id);
  const nameMap = new Map(people.map((p) => [p.id, p.name]));
  const nameOf = (uid: string) => nameMap.get(uid) ?? "Former member";
  const inIds = sql.join(
    ids.map((x) => sql`${x}`),
    sql`, `,
  );
  const mentionLike = `%"${me.id}"%`;
  const [counts, lasts] = await Promise.all([
    db.all<{ room_id: string; unread: number; mentioned: number }>(sql`
      select m.room_id as room_id,
        sum(case when coalesce(m.user_id, '') <> ${me.id} and m.created_at > s.seen then 1 else 0 end) as unread,
        sum(case when coalesce(m.user_id, '') <> ${me.id} and m.created_at > s.seen and m.mentions like ${mentionLike} then 1 else 0 end) as mentioned
      from chat_messages m
      join (
        -- Read up to the later of: last opened, or the person's own last message there.
        select c.id as room_id, max(
          coalesce((select last_read_at from chat_reads r where r.room_id = c.id and r.user_id = ${me.id}), 0),
          coalesce((select max(created_at) from chat_messages o where o.room_id = c.id and o.user_id = ${me.id}), 0)
        ) as seen
        from chat_rooms c where c.id in (${inIds})
      ) s on s.room_id = m.room_id
      where m.room_id in (${inIds})
      group by m.room_id`),
    db.all<{ room_id: string; user_id: string | null; body: string; kind: string; created_at: number }>(sql`
      select room_id, user_id, body, kind, created_at from (
        select room_id, user_id, body, kind, created_at, row_number() over (partition by room_id order by created_at desc) as rn
        from chat_messages where room_id in (${inIds})
      ) where rn = 1`),
  ]);
  const countOf = new Map(counts.map((c) => [c.room_id, c]));
  const lastOf = new Map(lasts.map((l) => [l.room_id, l]));
  return rooms.map((r) => {
    const memberIds = r.kind === "room" ? people.filter((p) => canSeeChat(r, p)).map((p) => p.id) : parseIds(r.memberIds);
    const c = countOf.get(r.id);
    const l = lastOf.get(r.id);
    const at = l ? new Date(Number(l.created_at) * 1000).toISOString() : null;
    const text = l ? (l.kind === "meeting" ? "Meeting" : l.kind === "call" ? "Call" : l.body || "File") : "";
    return {
      id: r.id,
      kind: r.kind,
      name: chatName(r.kind, r.name, memberIds, me.id, nameOf),
      sub: r.kind === "room" ? roomMembersLabel(r.archetypes) : `${memberIds.length}`,
      memberIds,
      otherId: r.kind === "dm" ? (memberIds.find((m) => m !== me.id) ?? null) : null,
      last: l ? { author: l.user_id === me.id ? "You" : (nameOf(l.user_id ?? "").split(" ")[0] ?? ""), text: text.replace(/\s+/g, " ").slice(0, 120), at: at! } : null,
      lastAt: at,
      unread: Number(c?.unread ?? 0),
      mentioned: Number(c?.mentioned ?? 0),
    };
  });
}

/** Messages (top level, or one thread's replies) with files, reactions and reply counts. */
export async function loadMessages(
  db: DB,
  engagementId: string,
  roomId: string,
  me: { id: string },
  people: ChatPerson[],
  opts: { parentId?: string; ids?: string[] } = {},
): Promise<ChatMsg[]> {
  const where = opts.ids
    ? and(eq(chatMessages.roomId, roomId), inArray(chatMessages.id, opts.ids))
    : opts.parentId
      ? and(eq(chatMessages.roomId, roomId), eq(chatMessages.parentId, opts.parentId))
      : and(eq(chatMessages.roomId, roomId), isNull(chatMessages.parentId));
  const rows = opts.ids?.length === 0 ? [] : (await db.select().from(chatMessages).where(where).orderBy(desc(chatMessages.createdAt)).limit(400)).reverse();
  if (!rows.length) return [];
  const msgIds = rows.map((m) => m.id);
  const authorIds = [...new Set(rows.map((m) => m.userId).filter((x): x is string => !!x))];
  const nameMap = new Map(people.map((p) => [p.id, p.name]));
  const missing = authorIds.filter((a) => !nameMap.has(a));
  if (missing.length) for (const u of await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, missing))) nameMap.set(u.id, u.name);
  const nameOf = (uid: string | null) => (uid && nameMap.get(uid)) || "Former member";

  const [files, reactions, replies] = await Promise.all([
    db.select().from(sources).where(and(eq(sources.engagementId, engagementId), inArray(sources.messageId, msgIds))),
    db.select().from(chatReactions).where(inArray(chatReactions.messageId, msgIds)).orderBy(asc(chatReactions.createdAt)),
    opts.parentId
      ? Promise.resolve([])
      : db
          .select({ parentId: chatMessages.parentId, userId: chatMessages.userId, createdAt: chatMessages.createdAt })
          .from(chatMessages)
          .where(and(eq(chatMessages.roomId, roomId), inArray(chatMessages.parentId, msgIds)))
          .orderBy(asc(chatMessages.createdAt)),
  ]);

  return rows.map((m) => {
    const rx = new Map<string, { emoji: string; count: number; mine: boolean; names: string[] }>();
    for (const r of reactions.filter((x) => x.messageId === m.id)) {
      const e = rx.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false, names: [] };
      e.count += 1;
      e.mine ||= r.userId === me.id;
      e.names.push(nameOf(r.userId));
      rx.set(r.emoji, e);
    }
    const mine = replies.filter((r) => r.parentId === m.id);
    const author = nameOf(m.userId);
    return {
      id: m.id,
      authorId: m.userId,
      author,
      initials: initials(author),
      at: iso(m.createdAt),
      body: m.body,
      kind: m.kind,
      meta: obj(m.meta),
      pinned: m.pinned,
      mine: m.userId === me.id,
      edited: !!m.editedAt,
      mentionsMe: parseIds(m.mentions).includes(me.id),
      files: files
        .filter((f) => f.messageId === m.id)
        .map((f) => ({
          id: f.id,
          filename: f.filename,
          folder: f.folder,
          pending: f.filing === "pending",
          mine: f.uploadedBy === me.id,
          suggestions: list(f.suggestions).filter((x): x is string => typeof x === "string"),
          links: list(f.links).map((l) => (l as { label?: string }).label ?? "").filter(Boolean),
        })),
      reactions: [...rx.values()],
      replies: {
        count: mine.length,
        lastAt: mine.length ? iso(mine[mine.length - 1]!.createdAt) : null,
        authors: [...new Set(mine.map((r) => r.userId))].slice(0, 3).map((u) => initials(nameOf(u))),
      },
    };
  });
}

/** Every file shared in a chat, newest first: the chat's Files tab. */
export async function loadSharedFiles(db: DB, engagementId: string, roomId: string, people: ChatPerson[]): Promise<SharedFile[]> {
  const rows = await db
    .select()
    .from(sources)
    .where(and(eq(sources.engagementId, engagementId), eq(sources.roomId, roomId)))
    .orderBy(desc(sources.createdAt))
    .limit(200);
  const nameMap = new Map(people.map((p) => [p.id, p.name]));
  return rows
    .filter((s) => s.messageId)
    .map((s) => ({ id: s.id, filename: s.filename, folder: s.folder, pending: s.filing === "pending", by: (s.uploadedBy && nameMap.get(s.uploadedBy)) || "", at: iso(s.createdAt) }));
}

/** Ids of the chat's pinned and meeting messages, for the Pinned and Meetings tabs. */
export async function loadMarked(db: DB, roomId: string) {
  const rows = await db
    .select({ id: chatMessages.id, pinned: chatMessages.pinned, kind: chatMessages.kind })
    .from(chatMessages)
    .where(and(eq(chatMessages.roomId, roomId), sql`(${chatMessages.pinned} = 1 or ${chatMessages.kind} = 'meeting')`));
  return { pinned: rows.filter((r) => r.pinned).map((r) => r.id), meetings: rows.filter((r) => r.kind === "meeting").map((r) => r.id) };
}
