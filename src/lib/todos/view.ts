import type { CaseContext } from "@/lib/case/page";
import type { TodoView } from "@/components/case/Todos";
import { shortDate } from "@/lib/case/progress";
import { isMine, loadTodos, type TodoRow } from "./data";

/** The Overview's to-dos for Mine or Team, ready to render. */
export async function todoViews(ctx: CaseContext, engagementId: string, team: boolean) {
  const { db, user } = ctx;
  const nameOf = new Map(ctx.members.map((m) => [m.id, m.name]));
  const { open, suggested } = await loadTodos(db, engagementId, user.archetype);
  const view = (t: TodoRow): TodoView => ({
    id: t.id,
    title: t.title,
    assignee: t.assigneeId ? (nameOf.get(t.assigneeId) ?? null) : null,
    due: t.dueDate ? shortDate(t.dueDate) : null,
    sourceLabel: t.source === "manual" ? "" : t.sourceLabel,
    sourceLink: t.sourceLink,
    canDelete: (t.createdBy === user.id && t.source === "manual") || ctx.canEdit,
  });
  return {
    open: open.filter((t) => team || isMine(t, user.id)).map(view),
    suggested: suggested.filter((t) => team || t.assigneeId === user.id || t.assigneeId === null).map(view),
  };
}
