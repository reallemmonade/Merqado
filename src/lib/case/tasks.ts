import type { TaskStatus } from "@/db/schema";

export interface TaskLike {
  status: TaskStatus;
  assigneeId: string | null;
  reviewerId: string | null;
  createdBy: string | null;
  dueDate?: string | null;
}

/** Who marks a task done: its reviewer, else whoever assigned it, else the module lead. */
export function reviewerOf(task: TaskLike, moduleLeadId?: string | null): string | null {
  return task.reviewerId ?? task.createdBy ?? moduleLeadId ?? null;
}

/**
 * Status moves a person may make on a task.
 * The assignee starts it and marks it ready for review; the reviewer marks it done or sends it back.
 * With no assignee, anyone who can edit the case works it; with no reviewer, anyone can close it.
 */
export function allowedMoves(task: TaskLike, userId: string, canEdit: boolean, moduleLeadId?: string | null): TaskStatus[] {
  if (!canEdit) return [];
  const reviewer = reviewerOf(task, moduleLeadId);
  const isReviewer = reviewer === null || reviewer === userId;
  const isWorker = task.assigneeId === null || task.assigneeId === userId;
  const moves = new Set<TaskStatus>();
  switch (task.status) {
    case "not_yet":
      if (isWorker || isReviewer) moves.add("in_progress");
      if (isWorker) moves.add("almost_done");
      break;
    case "in_progress":
      if (isWorker) moves.add("almost_done");
      if (isWorker || isReviewer) moves.add("not_yet");
      break;
    case "almost_done":
      if (isReviewer) moves.add("done");
      if (isWorker || isReviewer) moves.add("in_progress");
      break;
    case "done":
      if (isReviewer) moves.add("in_progress");
      break;
  }
  // A reviewer who is also the assignee can close their own work in one step.
  if ((task.status === "not_yet" || task.status === "in_progress") && isWorker && isReviewer) moves.add("done");
  return [...moves];
}

/** The one move a status button makes for this person, or null if they can't move it. */
export function primaryMove(task: TaskLike, userId: string, canEdit: boolean, moduleLeadId?: string | null): TaskStatus | null {
  const moves = allowedMoves(task, userId, canEdit, moduleLeadId);
  if (task.status === "in_progress" && moves.includes("done")) return "done";
  const forward: Record<TaskStatus, TaskStatus | null> = { not_yet: "in_progress", in_progress: "almost_done", almost_done: "done", done: null };
  const next = forward[task.status];
  return next && moves.includes(next) ? next : null;
}

/** Button text for a move. */
export const MOVE_LABEL: Record<TaskStatus, string> = {
  not_yet: "Not started",
  in_progress: "Start",
  almost_done: "Ready for review",
  done: "Done",
};

/** Due date: the task's own, else its column's date. */
export function dueOf(task: { dueDate?: string | null; milestoneId: string | null }, milestoneDate: Map<string, string>): string | null {
  return task.dueDate || (task.milestoneId ? (milestoneDate.get(task.milestoneId) ?? null) : null);
}

/** What ticking a task's checkbox does: close it if this person reviews it, else hand it in for review. */
export function checkMove(task: TaskLike, userId: string, canEdit: boolean, moduleLeadId?: string | null): TaskStatus | null {
  const moves = allowedMoves(task, userId, canEdit, moduleLeadId);
  if (moves.includes("done")) return "done";
  if (moves.includes("almost_done")) return "almost_done";
  return null;
}
