import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { engagementMembers, todos } from "@/db/schema";
import { aiError, notFoundJson, ok, parseOp, runAi } from "@/lib/case/api";
import { loadMembers } from "@/lib/case/page";
import { allows } from "@/lib/roles";
import { canSeeTodo } from "@/lib/todos/data";
import { scanForTodos } from "@/lib/todos/scan";

const ref = z.string().min(1).max(64);
const title = z.string().trim().min(1, "Write a to-do.").max(300);
const due = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

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

  async function onCase(userId: string | null | undefined) {
    if (!userId) return true;
    return !!(await db.query.engagementMembers.findFirst({ where: and(eq(engagementMembers.engagementId, id), eq(engagementMembers.userId, userId)) }));
  }

  if (op.op === "scan") {
    try {
      const members = await loadMembers(id, user.firmId);
      const res = await scanForTodos(db, { engagementId: id, viewer: { id: user.id, archetype: user.archetype }, members }, (q) => runAi(auth, "todo_scan", q));
      return ok(res);
    } catch (err) {
      return aiError(err);
    }
  }

  if (op.op === "add") {
    if (!(await onCase(op.assigneeId))) return notFoundJson();
    const [row] = await db
      .insert(todos)
      .values({ engagementId: id, title: op.title, assigneeId: op.assigneeId ?? null, dueDate: op.dueDate ?? null, status: "open", source: "manual", createdBy: user.id })
      .returning();
    return ok({ id: row!.id });
  }

  const todo = await db.query.todos.findFirst({ where: and(eq(todos.id, op.id), eq(todos.engagementId, id)) });
  if (!todo || !canSeeTodo(todo, user.archetype)) return notFoundJson();

  switch (op.op) {
    case "update":
      if (!(await onCase(op.assigneeId))) return notFoundJson();
      await db
        .update(todos)
        .set({
          ...(op.title !== undefined && { title: op.title }),
          ...(op.assigneeId !== undefined && { assigneeId: op.assigneeId }),
          ...(op.dueDate !== undefined && { dueDate: op.dueDate }),
        })
        .where(eq(todos.id, op.id));
      return ok();
    case "done":
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
        .set({ status: op.op === "accept" ? "open" : "dismissed" })
        .where(eq(todos.id, op.id));
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
