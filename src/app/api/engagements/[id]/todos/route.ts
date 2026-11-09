import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { todos } from "@/db/schema";
import { aiError, notFoundJson, ok, parseOp, runAi } from "@/lib/case/api";
import { loadMembers } from "@/lib/case/page";
import { notifyLater } from "@/lib/push/notify";
import { allows } from "@/lib/roles";
import { canSeeTodo } from "@/lib/todos/data";
import { isDate } from "@/lib/todos/extract";
import { scanForTodos } from "@/lib/todos/scan";

const ref = z.string().min(1).max(64);
const title = z.string().trim().min(1, "Write a to-do.").max(300);
const due = z.string().refine(isDate, "Pick a date.").nullable();

const Op = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add"), title, assigneeId: ref.nullable().optional(), dueDate: due.optional() }),
  z.object({ op: z.literal("update"), id: ref, title: title.optional(), assigneeId: ref.nullable().optional(), dueDate: due.optional() }),
  z.object({ op: z.literal("done"), id: ref, done: z.boolean() }),
  z.object({ op: z.literal("accept"), id: ref }),
  z.object({ op: z.literal("dismiss"), id: ref }),
  z.object({ op: z.literal("delete"), id: ref }),
  z.object({ op: z.literal("scan") }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await parseOp(req, id, "read", Op);
  if (r instanceof NextResponse) return r;
  const { auth, op } = r;
  const { db, user } = auth;

  /** The assignee must be on the case and, for a to-do from a private chat, in that chat's roles. */
  async function canAssign(userId: string | null | undefined, audience: string | null = null) {
    if (!userId) return true;
    const member = (await loadMembers(id, user.firmId)).find((m) => m.id === userId);
    return !!member && canSeeTodo({ audience }, member.archetype);
  }

  /** iPhone notification for someone else being given a to-do. */
  function notifyAssigned(assigneeId: string | null | undefined, todoTitle: string) {
    if (!assigneeId || assigneeId === user.id) return;
    notifyLater(db, [assigneeId], {
      title: `${user.name} gave you a to-do`,
      body: todoTitle.slice(0, 300),
      threadId: `todos-${id}`,
      category: "TODO",
      data: { url: "/tasks", caseId: id },
    });
  }

  if (op.op === "scan") {
    // Scanning runs a paid model call, so it needs edit access like other AI work on the case.
    if (!allows(auth.membership, "edit_findings")) return NextResponse.json({ error: "You can't scan chats on this case." }, { status: 403 });
    try {
      const members = await loadMembers(id, user.firmId);
      const res = await scanForTodos(db, { engagementId: id, viewer: { id: user.id, archetype: user.archetype }, members }, (q) => runAi(auth, "todo_scan", q));
      return ok(res);
    } catch (err) {
      return aiError(err);
    }
  }

  if (op.op === "add") {
    if (!(await canAssign(op.assigneeId))) return notFoundJson();
    const [row] = await db
      .insert(todos)
      .values({ engagementId: id, title: op.title, assigneeId: op.assigneeId ?? null, dueDate: op.dueDate ?? null, status: "open", source: "manual", createdBy: user.id })
      .returning();
    notifyAssigned(op.assigneeId, op.title);
    return ok({ id: row!.id });
  }

  const todo = await db.query.todos.findFirst({ where: and(eq(todos.id, op.id), eq(todos.engagementId, id)) });
  if (!todo || !canSeeTodo(todo, user.archetype)) return notFoundJson();

  switch (op.op) {
    case "update":
      if (todo.status !== "open" && todo.status !== "suggested") return notFoundJson();
      if (!(await canAssign(op.assigneeId, todo.audience))) return notFoundJson();
      await db
        .update(todos)
        .set({
          ...(op.title !== undefined && { title: op.title }),
          ...(op.assigneeId !== undefined && { assigneeId: op.assigneeId }),
          ...(op.dueDate !== undefined && { dueDate: op.dueDate }),
        })
        .where(eq(todos.id, op.id));
      if (op.assigneeId && op.assigneeId !== todo.assigneeId && todo.status === "open") notifyAssigned(op.assigneeId, op.title ?? todo.title);
      return ok();
    case "done":
      if (todo.status === "suggested" || todo.status === "dismissed") return notFoundJson();
      await db
        .update(todos)
        .set({ status: op.done ? "done" : "open", doneAt: op.done ? new Date() : null })
        .where(eq(todos.id, op.id));
      return ok();
    case "accept":
    case "dismiss":
      if (todo.status !== "suggested") return notFoundJson();
      await db
        .update(todos)
        // An unassigned suggestion goes to whoever adds it, not to whoever ran the scan.
        .set(op.op === "accept" ? { status: "open", assigneeId: todo.assigneeId ?? user.id } : { status: "dismissed" })
        .where(eq(todos.id, op.id));
      if (op.op === "accept") notifyAssigned(todo.assigneeId, todo.title);
      return ok();
    case "delete": {
      if (todo.createdBy !== user.id || todo.source !== "manual") {
        if (!allows(auth.membership, "edit_findings")) return NextResponse.json({ error: "You can only remove your own to-dos." }, { status: 403 });
      }
      await db.delete(todos).where(eq(todos.id, op.id));
      return ok();
    }
  }
}
