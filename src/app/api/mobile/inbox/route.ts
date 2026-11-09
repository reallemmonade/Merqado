import { NextResponse } from "next/server";
import { and, desc, eq, gt, inArray, isNotNull, like, ne, or } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { chatMessages, chatRooms, todos, users, workplanModules, workplanTasks } from "@/db/schema";
import { reviewerOf } from "@/lib/case/tasks";
import { canSeeTodo } from "@/lib/todos/data";
import { canSeeChat } from "@/lib/case/rooms";
import { mobileAuth, myCases } from "@/lib/mobile/data";

const WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

type Item = {
  id: string;
  kind: "mention" | "reply" | "task" | "review" | "todo";
  caseId: string;
  caseName: string;
  title: string;
  body: string;
  at: string;
  roomId?: string;
  messageId?: string;
  /** For a reply: the thread it's in. */
  threadId?: string;
  taskId?: string;
  todoId?: string;
};

/**
 * My activity feed, newest first: mentions of me, replies in threads I started or joined,
 * tasks and to-dos given to me, and tasks waiting on my review.
 */
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
    .select({ id: chatMessages.id, roomId: chatMessages.roomId, caseId: chatMessages.engagementId, parentId: chatMessages.parentId, body: chatMessages.body, at: chatMessages.createdAt, author: users.name })
    .from(chatMessages)
    .leftJoin(users, eq(users.id, chatMessages.userId))
    .where(and(inArray(chatMessages.engagementId, caseIds), gt(chatMessages.createdAt, since), ne(chatMessages.userId, user.id), like(chatMessages.mentions, `%"${user.id}"%`)))
    .orderBy(desc(chatMessages.createdAt))
    .limit(100);

  // Replies by others in threads where I wrote the first post or a reply.
  const mine = alias(chatMessages, "mine");
  const threadRows = await db
    .selectDistinct({ parentId: chatMessages.parentId })
    .from(chatMessages)
    .innerJoin(mine, and(eq(mine.userId, user.id), or(eq(mine.id, chatMessages.parentId), eq(mine.parentId, chatMessages.parentId))))
    .where(and(inArray(chatMessages.engagementId, caseIds), gt(chatMessages.createdAt, since), isNotNull(chatMessages.parentId)));
  const myThreads = threadRows.map((t) => t.parentId).filter((x): x is string => !!x);
  const mentioned = new Set(mentions.map((m) => m.id));
  const replies = myThreads.length
    ? (
        await db
          .select({ id: chatMessages.id, roomId: chatMessages.roomId, caseId: chatMessages.engagementId, parentId: chatMessages.parentId, body: chatMessages.body, at: chatMessages.createdAt, author: users.name })
          .from(chatMessages)
          .leftJoin(users, eq(users.id, chatMessages.userId))
          .where(and(inArray(chatMessages.parentId, myThreads), gt(chatMessages.createdAt, since), ne(chatMessages.userId, user.id)))
          .orderBy(desc(chatMessages.createdAt))
          .limit(100)
      ).filter((r) => !mentioned.has(r.id))
    : [];

  const roomIds = [...new Set([...mentions, ...replies].map((m) => m.roomId))];
  if (roomIds.length) {
    const rooms = await db.select().from(chatRooms).where(inArray(chatRooms.id, roomIds));
    const visible = new Set(rooms.filter((r) => canSeeChat(r, { id: user.id, archetype: caseOf.get(r.engagementId)?.role ?? user.archetype })).map((r) => r.id));
    for (const m of mentions) {
      if (!visible.has(m.roomId)) continue;
      items.push({ id: `m-${m.id}`, kind: "mention", caseId: m.caseId, caseName: caseOf.get(m.caseId)?.codeName ?? "", title: m.author ?? "", body: m.body, at: m.at.toISOString(), roomId: m.roomId, messageId: m.id, threadId: m.parentId ?? undefined });
    }
    for (const m of replies) {
      if (!visible.has(m.roomId)) continue;
      items.push({ id: `r-${m.id}`, kind: "reply", caseId: m.caseId, caseName: caseOf.get(m.caseId)?.codeName ?? "", title: m.author ?? "", body: m.body || "File", at: m.at.toISOString(), roomId: m.roomId, messageId: m.id, threadId: m.parentId ?? undefined });
    }
  }

  // Open to-dos someone else gave me.
  const given = await db
    .select({ id: todos.id, caseId: todos.engagementId, title: todos.title, audience: todos.audience, at: todos.createdAt, by: users.name })
    .from(todos)
    .leftJoin(users, eq(users.id, todos.createdBy))
    .where(and(inArray(todos.engagementId, caseIds), eq(todos.assigneeId, user.id), eq(todos.status, "open"), ne(todos.createdBy, user.id), gt(todos.createdAt, since)));
  for (const t of given) {
    const c = caseOf.get(t.caseId);
    if (!c || !canSeeTodo(t, c.role)) continue;
    items.push({ id: `d-${t.id}`, kind: "todo", caseId: t.caseId, caseName: c.codeName, title: t.title, body: t.by ?? "", at: t.at.toISOString(), todoId: t.id });
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
          and(eq(workplanTasks.status, "almost_done"), or(eq(workplanTasks.reviewerId, user.id), eq(workplanTasks.createdBy, user.id), eq(workplanModules.leadId, user.id))),
        ),
      ),
    );
  for (const t of tasks) {
    // With no reviewer named, the person who made the task (or the module lead) reviews it, as on the web.
    const review = t.status === "almost_done" && reviewerOf(t, t.moduleLead) === user.id && t.assigneeId !== user.id;
    const mineToDo = t.assigneeId === user.id && t.status !== "done";
    if (!review && !mineToDo) continue;
    items.push({ id: `t-${t.id}`, kind: review ? "review" : "task", caseId: t.caseId, caseName: caseOf.get(t.caseId)?.codeName ?? "", title: t.title, body: t.module, at: t.at.toISOString(), taskId: t.id });
  }

  items.sort((a, b) => b.at.localeCompare(a.at));
  return NextResponse.json({ items: items.slice(0, 100) });
}
