import { and, desc, eq, gt, inArray, isNotNull, like, ne, or } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { DB } from "@/db/client";
import { chatMessages, chatRooms, todos, users, workplanMilestones, workplanModules, workplanTasks, type Archetype, type NotificationKind } from "@/db/schema";
import { localTime } from "@/lib/cron/time-zone";
import { taskFlag, type TaskFlag } from "@/lib/inbox/flags";
import { reviewerOf } from "@/lib/case/tasks";
import { canSeeChat } from "@/lib/case/rooms";
import { canSeeTodo } from "@/lib/todos/data";

export const INBOX_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export type Person = { id: string; firmId: string; archetype: Archetype; timeZone?: string | null };
export type InboxCase = { id: string; codeName: string; role: Archetype };

/** One thing that needs a person, worked out from chats, to-dos and tasks. */
export type DerivedItem = {
  key: string;
  kind: NotificationKind;
  caseId: string;
  title: string;
  body: string;
  at: Date;
  link: string;
  data: { roomId?: string; messageId?: string; threadId?: string; taskId?: string; todoId?: string } & Partial<TaskFlag>;
};

const roomLink = (caseId: string, roomId: string, threadId?: string | null) =>
  `/case/${caseId}/room/${roomId}${threadId ? `?thread=${threadId}` : ""}`;

/**
 * What needs this person right now: mentions of them, replies in threads they started or joined,
 * tasks and to-dos given to them, and tasks waiting on their review.
 */
export async function deriveInbox(db: DB, user: Person, cases: InboxCase[], now = new Date()): Promise<DerivedItem[]> {
  if (cases.length === 0) return [];
  const caseIds = cases.map((c) => c.id);
  const caseOf = new Map(cases.map((c) => [c.id, c]));
  const since = new Date(now.getTime() - INBOX_WINDOW_MS);
  const today = localTime(now, user.timeZone).date;
  const items: DerivedItem[] = [];

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
      const threadId = m.parentId ?? undefined;
      items.push({ key: `m-${m.id}`, kind: "mention", caseId: m.caseId, title: m.author ?? "", body: m.body, at: m.at, link: roomLink(m.caseId, m.roomId, threadId), data: { roomId: m.roomId, messageId: m.id, threadId } });
    }
    for (const m of replies) {
      if (!visible.has(m.roomId)) continue;
      const threadId = m.parentId ?? undefined;
      items.push({ key: `r-${m.id}`, kind: "reply", caseId: m.caseId, title: m.author ?? "", body: m.body || "File", at: m.at, link: roomLink(m.caseId, m.roomId, threadId), data: { roomId: m.roomId, messageId: m.id, threadId } });
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
    items.push({ key: `d-${t.id}`, kind: "todo", caseId: t.caseId, title: t.title, body: t.by ?? "", at: t.at, link: "/tasks", data: { todoId: t.id } });
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
      updatedAt: workplanTasks.updatedAt,
      dueDate: workplanTasks.dueDate,
      milestoneDate: workplanMilestones.date,
    })
    .from(workplanTasks)
    .innerJoin(workplanModules, eq(workplanModules.id, workplanTasks.moduleId))
    .leftJoin(workplanMilestones, eq(workplanMilestones.id, workplanTasks.milestoneId))
    .where(
      and(
        inArray(workplanTasks.engagementId, caseIds),
        or(
          // Older open tasks are checked for overdue or idle below.
          and(eq(workplanTasks.assigneeId, user.id), ne(workplanTasks.status, "done")),
          and(eq(workplanTasks.status, "almost_done"), or(eq(workplanTasks.reviewerId, user.id), eq(workplanTasks.createdBy, user.id), eq(workplanModules.leadId, user.id))),
        ),
      ),
    );
  for (const t of tasks) {
    // With no reviewer named, the person who made the task (or the module lead) reviews it, as on the web.
    const review = t.status === "almost_done" && reviewerOf(t, t.moduleLead) === user.id && t.assigneeId !== user.id;
    const mineToDo = t.assigneeId === user.id && t.status !== "done";
    if (!review && !mineToDo) continue;
    // A review waits on the reviewer, so only a quiet task counts; its due date is the assignee's.
    const flag = taskFlag({ due: review ? null : (t.dueDate ?? t.milestoneDate), changedAt: t.updatedAt ?? t.at }, now, today);
    if (!review && !flag && t.at <= since) continue;
    items.push({ key: `t-${t.id}`, kind: review ? "review" : "task", caseId: t.caseId, title: t.title, body: t.module, at: t.at, link: "/tasks", data: { taskId: t.id, ...flag } });
  }

  return items;
}
