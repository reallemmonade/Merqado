/** The Desk: a case's workstreams (workplan modules) side by side, each with its progress, tasks and what needs attention. */
import type { TaskStatus } from "@/db/schema";
import { taskFlag, type TaskFlag } from "@/lib/inbox/flags";
import { dueOf, reviewerOf } from "./tasks";

type ModuleRow = { id: string; name: string; leadId: string | null };
type MilestoneRow = { id: string; date: string };
type TaskRow = {
  id: string;
  moduleId: string;
  milestoneId: string | null;
  title: string;
  assigneeId: string | null;
  reviewerId: string | null;
  createdBy: string | null;
  status: TaskStatus;
  dueDate: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export interface DeskTask {
  id: string;
  title: string;
  status: TaskStatus;
  due: string | null;
  assigneeId: string | null;
  flag: TaskFlag | null;
  /** Waiting on this person's review. */
  mineToReview: boolean;
}

export interface Workstream {
  id: string;
  name: string;
  leadId: string | null;
  counts: Record<TaskStatus, number> & { total: number };
  /** Overdue tasks plus tasks waiting on this person's review. */
  needs: number;
  tasks: DeskTask[];
  people: string[];
}

const ORDER: Record<TaskStatus, number> = { almost_done: 0, in_progress: 1, not_yet: 2, done: 3 };

export function buildDesk(
  wp: { modules: ModuleRow[]; milestones: MilestoneRow[]; tasks: TaskRow[] },
  me: string,
  now: Date,
  today: string,
): Workstream[] {
  const milestoneDate = new Map(wp.milestones.map((m) => [m.id, m.date]));
  return wp.modules.map((m) => {
    const rows = wp.tasks.filter((t) => t.moduleId === m.id);
    const counts = { not_yet: 0, in_progress: 0, almost_done: 0, done: 0, total: rows.length };
    const tasks: DeskTask[] = rows.map((t) => {
      counts[t.status]++;
      const due = dueOf(t, milestoneDate);
      const open = t.status !== "done";
      return {
        id: t.id,
        title: t.title,
        status: t.status,
        due,
        assigneeId: t.assigneeId,
        flag: open ? taskFlag({ due, changedAt: t.updatedAt ?? t.createdAt ?? now }, now, today) : null,
        mineToReview: t.status === "almost_done" && reviewerOf(t, m.leadId) === me,
      };
    });
    tasks.sort((a, b) => ORDER[a.status] - ORDER[b.status] || (a.due ?? "9999").localeCompare(b.due ?? "9999"));
    const people = [...new Set([m.leadId, ...rows.map((t) => t.assigneeId)].filter((x): x is string => !!x))];
    const needs = tasks.filter((t) => t.mineToReview || t.flag?.flag === "overdue").length;
    return { id: m.id, name: m.name, leadId: m.leadId, counts, needs, tasks, people };
  });
}
