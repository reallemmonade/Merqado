import { NextResponse } from "next/server";
import { and, eq, max } from "drizzle-orm";
import { z } from "zod";
import { ARCHETYPES, engagementMembers, TASK_STATUSES, workplanMilestones, workplanModules, workplanTasks } from "@/db/schema";
import { allows } from "@/lib/roles";
import { notFoundJson, ok, parseOp } from "@/lib/case/api";
import { allowedMoves, reviewerOf } from "@/lib/case/tasks";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");
const name = z.string().trim().min(1, "Add a name.").max(200);
const ref = z.string().min(1).max(64);

const Op = z.discriminatedUnion("op", [
  z.object({ op: z.literal("module.add"), name }),
  z.object({ op: z.literal("module.update"), id: ref, name: name.optional(), leadId: ref.nullable().optional() }),
  z.object({ op: z.literal("module.delete"), id: ref }),
  z.object({ op: z.literal("milestone.add"), label: name, date, isColumn: z.boolean().optional() }),
  z.object({ op: z.literal("milestone.update"), id: ref, label: name.optional(), date: date.optional(), isColumn: z.boolean().optional() }),
  z.object({ op: z.literal("milestone.delete"), id: ref }),
  z.object({
    op: z.literal("task.add"),
    moduleId: ref,
    milestoneId: ref.nullable().optional(),
    title: name,
    assigneeId: ref.nullable().optional(),
    reviewerId: ref.nullable().optional(),
    dueDate: date.nullable().optional(),
  }),
  z.object({
    op: z.literal("task.update"),
    id: ref,
    title: name.optional(),
    status: z.enum(TASK_STATUSES).optional(),
    assigneeId: ref.nullable().optional(),
    reviewerId: ref.nullable().optional(),
    milestoneId: ref.nullable().optional(),
    dueDate: date.nullable().optional(),
    note: z.string().trim().max(1000).optional(),
  }),
  z.object({ op: z.literal("task.delete"), id: ref }),
  z.object({ op: z.literal("member.role"), userId: ref, role: z.enum(ARCHETYPES).nullable() }),
]);

const PLAN_OPS = new Set(["module.add", "module.update", "module.delete", "milestone.add", "milestone.update", "milestone.delete"]);
const deny = (error: string) => NextResponse.json({ error }, { status: 403 });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await parseOp(req, id, "edit_findings", Op);
  if (r instanceof NextResponse) return r;
  const { auth, op } = r;
  const { db, membership } = auth;
  if (PLAN_OPS.has(op.op) && !allows(membership, "edit_plan")) return deny("Only managers can change modules and dates.");
  if (op.op === "task.add" && !allows(membership, "assign_tasks")) return deny("Only consultants and up can assign tasks.");
  if (op.op === "member.role" && !allows(membership, "set_roles")) return deny("Only managers can change roles.");

  switch (op.op) {
    case "module.add": {
      const [m] = await db.select({ n: max(workplanModules.sort) }).from(workplanModules).where(eq(workplanModules.engagementId, id));
      const [row] = await db.insert(workplanModules).values({ engagementId: id, name: op.name, sort: (m?.n ?? 0) + 1 }).returning();
      return ok({ id: row!.id });
    }
    case "module.update": {
      const res = await db
        .update(workplanModules)
        .set({ ...(op.name !== undefined && { name: op.name }), ...(op.leadId !== undefined && { leadId: op.leadId }) })
        .where(and(eq(workplanModules.id, op.id), eq(workplanModules.engagementId, id)))
        .returning({ id: workplanModules.id });
      return res.length ? ok() : notFoundJson();
    }
    case "module.delete":
      await db.delete(workplanModules).where(and(eq(workplanModules.id, op.id), eq(workplanModules.engagementId, id)));
      return ok();
    case "milestone.add": {
      const [row] = await db.insert(workplanMilestones).values({ engagementId: id, label: op.label, date: op.date, isColumn: op.isColumn ?? true }).returning();
      return ok({ id: row!.id });
    }
    case "milestone.update": {
      const res = await db
        .update(workplanMilestones)
        .set({
          ...(op.label !== undefined && { label: op.label }),
          ...(op.date !== undefined && { date: op.date }),
          ...(op.isColumn !== undefined && { isColumn: op.isColumn }),
        })
        .where(and(eq(workplanMilestones.id, op.id), eq(workplanMilestones.engagementId, id)))
        .returning({ id: workplanMilestones.id });
      return res.length ? ok() : notFoundJson();
    }
    case "milestone.delete":
      await db.delete(workplanMilestones).where(and(eq(workplanMilestones.id, op.id), eq(workplanMilestones.engagementId, id)));
      return ok();
    case "task.add": {
      const mod = await db.query.workplanModules.findFirst({ where: and(eq(workplanModules.id, op.moduleId), eq(workplanModules.engagementId, id)) });
      if (!mod) return notFoundJson();
      const [row] = await db
        .insert(workplanTasks)
        .values({
          engagementId: id,
          moduleId: op.moduleId,
          milestoneId: op.milestoneId ?? null,
          title: op.title,
          assigneeId: op.assigneeId ?? null,
          reviewerId: op.reviewerId ?? auth.user.id,
          dueDate: op.dueDate ?? null,
          createdBy: auth.user.id,
        })
        .returning();
      return ok({ id: row!.id });
    }
    case "task.update": {
      const task = await db.query.workplanTasks.findFirst({ where: and(eq(workplanTasks.id, op.id), eq(workplanTasks.engagementId, id)) });
      if (!task) return notFoundJson();
      const mod = await db.query.workplanModules.findFirst({ where: eq(workplanModules.id, task.moduleId) });
      const lead = mod?.leadId ?? null;
      const me = auth.user.id;
      if (op.status !== undefined && op.status !== task.status && !allowedMoves(task, me, true, lead).includes(op.status)) {
        const msg = op.status === "done" ? "Only the reviewer can mark this done." : "Only the assignee or reviewer can change this.";
        return NextResponse.json({ error: msg }, { status: 403 });
      }
      const reviewer = reviewerOf(task, lead);
      const manages = reviewer === null || reviewer === me || task.createdBy === me;
      const reassigns = op.title !== undefined || op.assigneeId !== undefined || op.reviewerId !== undefined || op.milestoneId !== undefined || op.dueDate !== undefined;
      if (reassigns && !(manages && allows(membership, "assign_tasks"))) return deny("Only whoever assigned this can change it.");
      // A reviewer sending work back can leave a note; it clears once the task is done.
      const sendBack = op.status === "in_progress" && (task.status === "almost_done" || task.status === "done");
      await db
        .update(workplanTasks)
        .set({
          ...(op.title !== undefined && { title: op.title }),
          ...(op.status !== undefined && { status: op.status }),
          ...(op.assigneeId !== undefined && { assigneeId: op.assigneeId }),
          ...(op.reviewerId !== undefined && { reviewerId: op.reviewerId }),
          ...(op.milestoneId !== undefined && { milestoneId: op.milestoneId }),
          ...(op.dueDate !== undefined && { dueDate: op.dueDate }),
          ...(sendBack && { reviewNote: op.note ?? "" }),
          ...(op.status === "done" && { reviewNote: "" }),
        })
        .where(and(eq(workplanTasks.id, op.id), eq(workplanTasks.engagementId, id)));
      return ok();
    }
    case "task.delete": {
      const task = await db.query.workplanTasks.findFirst({ where: and(eq(workplanTasks.id, op.id), eq(workplanTasks.engagementId, id)) });
      if (!task) return notFoundJson();
      const mod = await db.query.workplanModules.findFirst({ where: eq(workplanModules.id, task.moduleId) });
      const reviewer = reviewerOf(task, mod?.leadId ?? null);
      const manages = reviewer === null || reviewer === auth.user.id || task.createdBy === auth.user.id;
      if (!manages || !allows(membership, "assign_tasks")) return deny("Only whoever assigned this can delete it.");
      await db.delete(workplanTasks).where(eq(workplanTasks.id, op.id));
      return ok();
    }
    case "member.role": {
      const res = await db
        .update(engagementMembers)
        .set({ caseRole: op.role })
        .where(and(eq(engagementMembers.engagementId, id), eq(engagementMembers.userId, op.userId)))
        .returning({ userId: engagementMembers.userId });
      return res.length ? ok() : notFoundJson();
    }
  }
}
