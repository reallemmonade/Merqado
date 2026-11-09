import { and, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, type DB } from "@/db/client";
import {
  chatMessages,
  chatReads,
  chatRooms,
  engagementMembers,
  engagements,
  firmMembers,
  firmRoles,
  users,
  type Archetype,
} from "@/db/schema";
import { canSeeRoom } from "@/lib/case/rooms";
import { getSessionUser, type SessionUser } from "@/lib/session";

/** Signs in an iPhone app request (bearer token) or a browser one (cookie). */
export async function mobileAuth(): Promise<{ db: DB; user: SessionUser } | NextResponse> {
  const db = getDb();
  const user = await getSessionUser(db);
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  return { db, user };
}

/** The cases this person is on, newest first. */
export async function myCases(db: DB, user: SessionUser) {
  return db
    .select({ id: engagements.id, codeName: engagements.clientName, title: engagements.title, status: engagements.status, access: engagementMembers.access })
    .from(engagementMembers)
    .innerJoin(engagements, eq(engagements.id, engagementMembers.engagementId))
    .where(and(eq(engagementMembers.userId, user.id), eq(engagements.firmId, user.firmId)))
    .orderBy(desc(engagements.createdAt));
}

/** Everyone on a case with their archetype, for room visibility and @mentions. */
export async function caseMembers(db: DB, engagementId: string, firmId: string) {
  return db
    .select({ id: users.id, name: users.name, archetype: firmRoles.archetype, title: firmRoles.title })
    .from(engagementMembers)
    .innerJoin(users, eq(users.id, engagementMembers.userId))
    .innerJoin(firmMembers, and(eq(firmMembers.userId, users.id), eq(firmMembers.firmId, firmId)))
    .innerJoin(firmRoles, eq(firmRoles.id, firmMembers.firmRoleId))
    .where(eq(engagementMembers.engagementId, engagementId));
}

/** People on the case who can see a room with these archetypes. */
export function roomAudience<T extends { archetype: Archetype }>(members: T[], archetypesJson: string): T[] {
  return members.filter((m) => canSeeRoom(archetypesJson, m.archetype));
}

/** The rooms this person can see on a case, with the last message and their unread count. */
export async function roomsFor(db: DB, user: SessionUser, engagementId: string) {
  const rooms = (await db.select().from(chatRooms).where(eq(chatRooms.engagementId, engagementId)).orderBy(chatRooms.sort)).filter((r) =>
    canSeeRoom(r.archetypes, user.archetype),
  );
  if (rooms.length === 0) return [];
  const ids = rooms.map((r) => r.id);
  const reads = await db.select().from(chatReads).where(and(eq(chatReads.userId, user.id), inArray(chatReads.roomId, ids)));
  const readAt = new Map(reads.map((r) => [r.roomId, r.lastReadAt]));
  return Promise.all(
    rooms.map(async (r) => {
      const [last] = await db
        .select({ body: chatMessages.body, createdAt: chatMessages.createdAt, author: users.name })
        .from(chatMessages)
        .leftJoin(users, eq(users.id, chatMessages.userId))
        .where(eq(chatMessages.roomId, r.id))
        .orderBy(desc(chatMessages.createdAt))
        .limit(1);
      const since = readAt.get(r.id) ?? new Date(0);
      const [{ n } = { n: 0 }] = await db
        .select({ n: sql<number>`count(*)` })
        .from(chatMessages)
        .where(and(eq(chatMessages.roomId, r.id), gt(chatMessages.createdAt, since), ne(chatMessages.userId, user.id)));
      return {
        id: r.id,
        name: r.name,
        lastBody: last?.body ?? "",
        lastAuthor: last?.author ?? "",
        lastAt: last?.createdAt?.toISOString() ?? null,
        unread: Number(n),
      };
    }),
  );
}

export async function markRead(db: DB, userId: string, roomId: string) {
  const now = new Date();
  await db
    .insert(chatReads)
    .values({ userId, roomId, lastReadAt: now })
    .onConflictDoUpdate({ target: [chatReads.userId, chatReads.roomId], set: { lastReadAt: now } });
}
