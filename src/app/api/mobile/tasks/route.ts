import { NextResponse } from "next/server";
import { and, eq, inArray, or } from "drizzle-orm";
import { engagements, users, workplanMilestones, workplanModules, workplanTasks } from "@/db/schema";
import { allowedMoves, reviewerOf } from "@/lib/case/tasks";
import { allows } from "@/lib/roles";
import { mobileAuth, myCases } from "@/lib/mobile/data";

/** Tasks I do or review across my cases, with the status moves I'm allowed to make. */
export async function GET() {
  const auth = await mobileAuth();
  if (auth instanceof NextResponse) return auth;
  const { db, user } = auth;
  const cases = await myCases(db, user);
  if (cases.length === 0) return NextResponse.json({ tasks: [] });
  const canEdit = new Map(cases.map((c) => [c.id, allows(c, "edit_findings")]));
  const rows = await db
    .select({
      task: workplanTasks,
      caseName: engagements.clientName,
      module: workplanModules.name,
      moduleLead: workplanModules.leadId,
      milestoneDate: workplanMilestones.date,
      assignee: users.name,
    })
    .from(workplanTasks)
    .innerJoin(engagements, eq(engagements.id, workplanTasks.engagementId))
    .innerJoin(workplanModules, eq(workplanModules.id, workplanTasks.moduleId))
    .leftJoin(workplanMilestones, eq(workplanMilestones.id, workplanTasks.milestoneId))
    .leftJoin(users, eq(users.id, workplanTasks.assigneeId))
    .where(and(inArray(workplanTasks.engagementId, cases.map((c) => c.id)), or(eq(workplanTasks.assigneeId, user.id), eq(workplanTasks.reviewerId, user.id), eq(workplanTasks.createdBy, user.id), eq(workplanModules.leadId, user.id))));
  // With no reviewer named, the person who made the task (or the module lead) reviews it, as on the web.
  const tasks = rows
    .filter((r) => r.task.assigneeId === user.id || reviewerOf(r.task, r.moduleLead) === user.id)
    .map((r) => {
    const t = r.task;
    return {
      id: t.id,
      caseId: t.engagementId,
      caseName: r.caseName,
      title: t.title,
      status: t.status,
      module: r.module,
      due: t.dueDate ?? r.milestoneDate ?? null,
      mine: t.assigneeId === user.id,
      toReview: reviewerOf(t, r.moduleLead) === user.id && t.assigneeId !== user.id,
      assignee: r.assignee ?? "",
      reviewNote: t.reviewNote,
      moves: allowedMoves(t, user.id, canEdit.get(t.engagementId) ?? false, r.moduleLead),
    };
  });
  tasks.sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  return NextResponse.json({ tasks });
}
