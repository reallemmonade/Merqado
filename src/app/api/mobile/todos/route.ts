import { NextResponse } from "next/server";
import { allows } from "@/lib/roles";
import { loadMembers } from "@/lib/case/page";
import { mobileAuth, myCases } from "@/lib/mobile/data";
import { isMine, loadTodos, type TodoRow } from "@/lib/todos/data";

/**
 * To-dos across my cases, for the iPhone app: open and suggested ones my role on each case may
 * see, plus each case's people to assign them to. Changes go to POST /api/engagements/<id>/todos.
 */
export async function GET() {
  const auth = await mobileAuth();
  if (auth instanceof NextResponse) return auth;
  const { db, user } = auth;
  const cases = await myCases(db, user);
  const todos: unknown[] = [];
  const people: Record<string, { id: string; name: string }[]> = {};
  await Promise.all(
    cases.map(async (c) => {
      const [members, { open, suggested }] = await Promise.all([loadMembers(c.id, user.firmId), loadTodos(db, c.id, c.role)]);
      people[c.id] = members.map((m) => ({ id: m.id, name: m.name }));
      const nameOf = new Map(members.map((m) => [m.id, m.name]));
      const canEdit = allows(c, "edit_findings");
      const view = (t: TodoRow) => ({
        id: t.id,
        caseId: c.id,
        caseName: c.codeName,
        title: t.title,
        status: t.status,
        assigneeId: t.assigneeId,
        assignee: t.assigneeId ? (nameOf.get(t.assigneeId) ?? "") : "",
        due: t.dueDate,
        mine: isMine(t, user.id),
        sourceLabel: t.source === "manual" ? "" : t.sourceLabel,
        canDelete: (t.createdBy === user.id && t.source === "manual") || canEdit,
      });
      todos.push(...open.map(view), ...suggested.map(view));
    }),
  );
  return NextResponse.json({ todos, people });
}
