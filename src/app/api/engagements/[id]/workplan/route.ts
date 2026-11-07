import { NextResponse } from "next/server";
import { and, eq, max } from "drizzle-orm";
import { z } from "zod";
import { TASK_STATUSES, workplanMilestones, workplanModules, workplanTasks } from "@/db/schema";
import { notFoundJson, ok, parseOp } from "@/lib/case/api";

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
  z.object({ op: z.literal("task.add"), moduleId: ref, milestoneId: ref.nullable().optional(), title: name, assigneeId: ref.nullable().optional() }),
  z.object({
    op: z.literal("task.update"),
    id: ref,
    title: name.optional(),
    status: z.enum(TASK_STATUSES).optional(),
    assigneeId: ref.nullable().optional(),
    milestoneId: ref.nullable().optional(),
  }),
  z.object({ op: z.literal("task.delete"), id: ref }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await parseOp(req, id, "edit_findings", Op);
  if (r instanceof NextResponse) return r;
  const { auth, op } = r;
  const { db } = auth;

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
        .values({ engagementId: id, moduleId: op.moduleId, milestoneId: op.milestoneId ?? null, title: op.title, assigneeId: op.assigneeId ?? null })
        .returning();
      return ok({ id: row!.id });
    }
    case "task.update": {
      const res = await db
        .update(workplanTasks)
        .set({
          ...(op.title !== undefined && { title: op.title }),
          ...(op.status !== undefined && { status: op.status }),
          ...(op.assigneeId !== undefined && { assigneeId: op.assigneeId }),
          ...(op.milestoneId !== undefined && { milestoneId: op.milestoneId }),
        })
        .where(and(eq(workplanTasks.id, op.id), eq(workplanTasks.engagementId, id)))
        .returning({ id: workplanTasks.id });
      return res.length ? ok() : notFoundJson();
    }
    case "task.delete":
      await db.delete(workplanTasks).where(and(eq(workplanTasks.id, op.id), eq(workplanTasks.engagementId, id)));
      return ok();
  }
}
