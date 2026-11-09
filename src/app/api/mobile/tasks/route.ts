import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { engagements, workplanMilestones, workplanModules, workplanTasks } from "@/db/schema";
import { mobileAuth, myCases } from "@/lib/mobile/data";

/** Workplan tasks assigned to me across my cases. */
export async function GET() {
  const auth = await mobileAuth();
  if (auth instanceof NextResponse) return auth;
  const { db, user } = auth;
  const caseIds = (await myCases(db, user)).map((c) => c.id);
  if (caseIds.length === 0) return NextResponse.json({ tasks: [] });
  const rows = await db
    .select({
      id: workplanTasks.id,
      caseId: workplanTasks.engagementId,
      caseName: engagements.clientName,
      title: workplanTasks.title,
      status: workplanTasks.status,
      module: workplanModules.name,
      due: workplanMilestones.date,
      milestone: workplanMilestones.label,
    })
    .from(workplanTasks)
    .innerJoin(engagements, eq(engagements.id, workplanTasks.engagementId))
    .innerJoin(workplanModules, eq(workplanModules.id, workplanTasks.moduleId))
    .leftJoin(workplanMilestones, eq(workplanMilestones.id, workplanTasks.milestoneId))
    .where(and(eq(workplanTasks.assigneeId, user.id), inArray(workplanTasks.engagementId, caseIds)));
  rows.sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  return NextResponse.json({ tasks: rows });
}
