import { and, desc, eq, inArray } from "drizzle-orm";
import type { DB } from "@/db/client";
import { todos, type Archetype } from "@/db/schema";
import { parseArchetypes } from "@/lib/case/rooms";

export type TodoRow = typeof todos.$inferSelect;

/** Suggestions from a private chat stay with the roles in that chat. */
export function canSeeTodo(t: Pick<TodoRow, "audience">, archetype: Archetype): boolean {
  return t.audience === null || parseArchetypes(t.audience).includes(archetype);
}

/** Open and suggested to-dos on a case that this person may see. */
export async function loadTodos(db: DB, engagementId: string, archetype: Archetype) {
  const rows = await db
    .select()
    .from(todos)
    .where(and(eq(todos.engagementId, engagementId), inArray(todos.status, ["open", "suggested"])))
    .orderBy(desc(todos.createdAt));
  const visible = rows.filter((t) => canSeeTodo(t, archetype));
  return {
    open: visible.filter((t) => t.status === "open").reverse(),
    suggested: visible.filter((t) => t.status === "suggested"),
  };
}

/** "Mine" is what's assigned to me, plus unassigned ones I wrote. */
export function isMine(t: Pick<TodoRow, "assigneeId" | "createdBy">, userId: string): boolean {
  return t.assigneeId === userId || (t.assigneeId === null && t.createdBy === userId);
}
