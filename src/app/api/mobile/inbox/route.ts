import { NextResponse } from "next/server";
import { and, desc, eq, gt, inArray, ne } from "drizzle-orm";
import { chatMessages, chatRooms, engagements, users, workplanModules, workplanTasks } from "@/db/schema";
import { canSeeRoom } from "@/lib/case/rooms";
import { findMentions } from "@/lib/mobile/mentions";
import { caseMembers, mobileAuth, myCases } from "@/lib/mobile/data";

const WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/** Mentions of me and tasks given to me, newest first. */
export async function GET() {
  const auth = await mobileAuth();
  if (auth instanceof NextResponse) return auth;
  const { db, user } = auth;
  const cases = await myCases(db, user);
  if (cases.length === 0) return NextResponse.json({ items: [] });
  const caseIds = cases.map((c) => c.id);
  const since = new Date(Date.now() - WINDOW_MS);

  const rooms = (await db.select().from(chatRooms).where(inArray(chatRooms.engagementId, caseIds))).filter((r) => canSeeRoom(r.archetypes, user.archetype));
  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const caseName = new Map(cases.map((c) => [c.id, c.codeName]));

  const items: { id: string; kind: "mention" | "task"; caseId: string; caseName: string; title: string; body: string; at: string; roomId?: string; messageId?: string; taskId?: string }[] = [];

  if (rooms.length) {
    const msgs = await db
      .select({ id: chatMessages.id, roomId: chatMessages.roomId, caseId: chatMessages.engagementId, body: chatMessages.body, at: chatMessages.createdAt, author: users.name })
      .from(chatMessages)
      .leftJoin(users, eq(users.id, chatMessages.userId))
      .where(and(inArray(chatMessages.roomId, [...roomById.keys()]), gt(chatMessages.createdAt, since), ne(chatMessages.userId, user.id)))
      .orderBy(desc(chatMessages.createdAt))
      .limit(500);
    const members = new Map<string, { id: string; name: string }[]>();
    for (const m of msgs) {
      if (!m.body.includes("@")) continue;
      if (!members.has(m.caseId)) members.set(m.caseId, await caseMembers(db, m.caseId, user.firmId));
      if (!findMentions(m.body, members.get(m.caseId)!).includes(user.id)) continue;
      items.push({
        id: `m-${m.id}`,
        kind: "mention",
        caseId: m.caseId,
        caseName: caseName.get(m.caseId) ?? "",
        title: m.author ?? "",
        body: m.body,
        at: m.at.toISOString(),
        roomId: m.roomId,
        messageId: m.id,
      });
    }
  }

  const tasks = await db
    .select({ id: workplanTasks.id, caseId: workplanTasks.engagementId, title: workplanTasks.title, module: workplanModules.name, at: workplanTasks.createdAt })
    .from(workplanTasks)
    .innerJoin(workplanModules, eq(workplanModules.id, workplanTasks.moduleId))
    .innerJoin(engagements, eq(engagements.id, workplanTasks.engagementId))
    .where(and(eq(workplanTasks.assigneeId, user.id), inArray(workplanTasks.engagementId, caseIds), gt(workplanTasks.createdAt, since), ne(workplanTasks.status, "done")));
  for (const t of tasks) {
    items.push({ id: `t-${t.id}`, kind: "task", caseId: t.caseId, caseName: caseName.get(t.caseId) ?? "", title: t.title, body: t.module, at: t.at.toISOString(), taskId: t.id });
  }

  items.sort((a, b) => b.at.localeCompare(a.at));
  return NextResponse.json({ items: items.slice(0, 100) });
}
