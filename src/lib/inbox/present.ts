import type { InboxEntry } from "@/lib/notifications/sync";

/** Where the item opens in the web and desktop app. */
export function webLink(e: Pick<InboxEntry, "kind" | "caseId" | "roomId" | "threadId" | "taskId" | "todoId">): string {
  const base = `/e/${e.caseId}`;
  if ((e.kind === "mention" || e.kind === "reply") && e.roomId) return `${base}/channel?room=${e.roomId}${e.threadId ? `&thread=${e.threadId}` : ""}`;
  if ((e.kind === "task" || e.kind === "review") && e.taskId) return `${base}/workplan#task-${e.taskId}`;
  if (e.kind === "todo" && e.todoId) return `${base}#todo-${e.todoId}`;
  return base;
}

/** The row's two lines. Mentions and replies store the author as title and the message as body. */
export function rowText(e: Pick<InboxEntry, "kind" | "title" | "body">): { title: string; sub: string } {
  switch (e.kind) {
    case "mention":
      return { title: `${e.title || "Someone"} mentioned you`, sub: e.body };
    case "reply":
      return { title: `${e.title || "Someone"} replied`, sub: e.body };
    case "review":
      return { title: `Review: ${e.title}`, sub: e.body };
    case "todo":
      return { title: e.title, sub: e.body ? `To-do · ${e.body}` : "To-do" };
    default:
      return { title: e.title, sub: e.body };
  }
}

/** Short age: 5m, 3h, 2d, 6w. */
export function age(at: string | Date, now = new Date()): string {
  const mins = Math.max(0, Math.round((now.getTime() - new Date(at).getTime()) / 60000));
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return days < 14 ? `${days}d` : `${Math.round(days / 7)}w`;
}
