import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, type DB } from "@/db/client";
import { chatReads, engagementMembers, engagements } from "@/db/schema";
import { getSessionUser, type SessionUser } from "@/lib/session";

/** Signs in an iPhone app request (bearer token) or a browser one (cookie). */
export async function mobileAuth(): Promise<{ db: DB; user: SessionUser } | NextResponse> {
  const db = getDb();
  const user = await getSessionUser(db);
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  return { db, user };
}

/** The cases this person is on, newest first, with their role on each. */
export async function myCases(db: DB, user: Pick<SessionUser, "id" | "firmId" | "archetype">) {
  const rows = await db
    .select({
      id: engagements.id,
      codeName: engagements.clientName,
      title: engagements.title,
      status: engagements.status,
      access: engagementMembers.access,
      caseRole: engagementMembers.caseRole,
    })
    .from(engagementMembers)
    .innerJoin(engagements, eq(engagements.id, engagementMembers.engagementId))
    .where(and(eq(engagementMembers.userId, user.id), eq(engagements.firmId, user.firmId)))
    .orderBy(desc(engagements.createdAt));
  return rows.map(({ caseRole, ...c }) => ({ ...c, role: caseRole ?? user.archetype }));
}

export async function markRead(db: DB, userId: string, roomId: string) {
  const now = new Date();
  await db
    .insert(chatReads)
    .values({ userId, roomId, lastReadAt: now })
    .onConflictDoUpdate({ target: [chatReads.roomId, chatReads.userId], set: { lastReadAt: now } });
}
