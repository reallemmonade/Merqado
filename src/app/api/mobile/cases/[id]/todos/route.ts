import { NextResponse } from "next/server";
import { loadMembers } from "@/lib/case/page";
import { authorize } from "@/lib/experts/api";
import { isMine, loadTodos } from "@/lib/todos/data";

/** A case's open to-dos and AI suggestions, for the phone's To-dos tab. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id, "read");
  if (auth instanceof NextResponse) return auth;
  const { db, user } = auth;
  const [{ open, suggested }, members] = await Promise.all([loadTodos(db, id, user.archetype), loadMembers(id, user.firmId)]);
  const nameOf = new Map(members.map((m) => [m.id, m.name]));
  const shape = (t: (typeof open)[number]) => ({
    id: t.id,
    title: t.title,
    assigneeId: t.assigneeId,
    assignee: t.assigneeId ? (nameOf.get(t.assigneeId) ?? "") : "",
    due: t.dueDate,
    source: t.sourceLabel,
    mine: isMine(t, user.id),
  });
  return NextResponse.json({
    todos: open.map(shape),
    suggested: suggested.map(shape),
    people: members.map((m) => ({ id: m.id, name: m.name, title: m.title })),
  });
}
