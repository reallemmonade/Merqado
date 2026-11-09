import { reviewerOf } from "@/lib/case/tasks";
import { NextResponse } from "next/server";
import { and, desc, eq, gt, inArray, like, ne, or } from "drizzle-orm";
import { chatMessages, chatRooms, users, workplanModules, workplanTasks } from "@/db/schema";
import { canSeeChat } from "@/lib/case/rooms";
import { mobileAuth, myCases } from "@/lib/mobile/data";

const WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

type Item = { id: string; kind: "mention" | "task" | "review"; caseId: string; caseName: string; title: string; body: string; at: string; roomId?: string; messageId?: string; taskId?: string };

/** Mentions of me, tasks given to me and tasks waiting on my review, newest first. */
export async function GET() {
  const auth = await mobileAuth();
  if (auth instanceof NextResponse) return auth;
  const { db, user } = auth;
  const cases = await myCases(db, user);
  if (cases.length === 0) return NextResponse.json({ items: [] });
  const caseIds = cases.map((c) => c.id);
  const caseOf = new Map(cases.map((c) => [c.id, c]));
  const since = new Date(Date.now() - WINDOW_MS);
  const items: Item[] = [];

  const mentions = await db
    .select({ id: chatMessages.id, roomId: chatMessages.roomId, caseId: chatMessages.engagementId, body: chatMessages.body, at: chatMessages.createdAt, author: users.name })
    .from(chatMessages)
    .leftJoin(users, eq(users.id, chatMessages.userId))
    .where(and(inArray(chatMessages.engagementId, caseIds), gt(chatMessages.createdAt, since), ne(chatMessages.userId, user.id), like(chatMessages.mentions, `%"${user.id}"%`)))
    .orderBy(desc(chatMessages.createdAt))
    .limit(100);
  if (mentions.length) {
    const rooms = await db.select().from(chatRooms).where(inArray(chatRooms.id, [...new Set(mentions.map((m) => m.roomId))]));
    const visible = new Set(rooms.filter((r) => canSeeChat(r, { id: user.id, archetype: caseOf.get(r.engagementId)?.role ?? user.archetype })).map((r) => r.id));
    for (const m of mentions) {
      if (!visible.has(m.roomId)) continue;
      items.push({ id: `m-${m.id}`, kind: "mention", caseId: m.caseId, caseName: caseOf.get(m.caseId)?.codeName ?? "", title: m.author ?? "", body: m.body, at: m.at.toISOString(), roomId: m.roomId, messageId: m.id });
    }
  }

  const tasks = await db
    .select({
      id: workplanTasks.id,
      caseId: workplanTasks.engagementId,
      title: workplanTasks.title,
      status: workplanTasks.status,
      assigneeId: workplanTasks.assigneeId,
      reviewerId: workplanTasks.reviewerId,
      createdBy: workplanTasks.createdBy,
      moduleLead: workplanModules.leadId,
      module: workplanModules.name,
      at: workplanTasks.createdAt,
    })
    .from(workplanTasks)
    .innerJoin(workplanModules, eq(workplanModules.id, workplanTasks.moduleId))
    .where(
      and(
        inArray(workplanTasks.engagementId, caseIds),
        or(
          and(eq(workplanTasks.assigneeId, user.id), gt(workplanTasks.createdAt, since), ne(workplanTasks.status, "done")),
          // Reviewer falls back to whoever made the task, then the module lead (reviewerOf).
          and(eq(workplanTasks.status, "almost_done"), or(eq(workplanTasks.reviewerId, user.id), eq(workplanTasks.createdBy, user.id), eq(workplanModules.leadId, user.id))),
        ),
      ),
    );
  for (const t of tasks) {
    const review = t.status === "almost_done" && reviewerOf(t, t.moduleLead) === user.id && t.assigneeId !== user.id;
    if (!review && t.assigneeId !== user.id) continue;
    items.push({ id: `t-${t.id}`, kind: review ? "review" : "task", caseId: t.caseId, caseName: caseOf.get(t.caseId)?.codeName ?? "", title: t.title, body: t.module, at: t.at.toISOString(), taskId: t.id });
  }

  items.sort((a, b) => b.at.localeCompare(a.at));
  return NextResponse.json({ items: items.slice(0, 100) });
}
