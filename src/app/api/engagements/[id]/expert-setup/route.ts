import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { caseBudgets, caseExpenses, engagements, expertTopics, expertTypes, hypotheses, runningGuides } from "@/db/schema";
import { authorize, badRequest } from "@/lib/experts/api";
import { setupOp } from "@/lib/experts/schemas";

/** Case setup for the Experts tab: types, topics, hypotheses, budget, expenses, running guides. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id, "edit_experts");
  if (auth instanceof NextResponse) return auth;
  const parsed = setupOp.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Some of those values aren't valid.");
  const op = parsed.data;
  const { db } = auth;

  switch (op.kind) {
    case "type": {
      if (op.id) await db.update(expertTypes).set({ name: op.name, target: op.target }).where(and(eq(expertTypes.id, op.id), eq(expertTypes.engagementId, id)));
      else await db.insert(expertTypes).values({ engagementId: id, name: op.name, target: op.target, sort: Date.now() % 1e9 });
      break;
    }
    case "topic": {
      if (op.id) await db.update(expertTopics).set({ name: op.name, target: op.target }).where(and(eq(expertTopics.id, op.id), eq(expertTopics.engagementId, id)));
      else await db.insert(expertTopics).values({ engagementId: id, name: op.name, target: op.target, sort: Date.now() % 1e9 });
      break;
    }
    case "hypothesis": {
      if (op.id) await db.update(hypotheses).set({ statement: op.statement, slideRef: op.slideRef }).where(and(eq(hypotheses.id, op.id), eq(hypotheses.engagementId, id)));
      else await db.insert(hypotheses).values({ engagementId: id, statement: op.statement, slideRef: op.slideRef, sort: Date.now() % 1e9 });
      break;
    }
    case "budget": {
      await db
        .insert(caseBudgets)
        .values({ engagementId: id, total: op.total, plannedInterviews: op.plannedInterviews })
        .onConflictDoUpdate({ target: caseBudgets.engagementId, set: { total: op.total, plannedInterviews: op.plannedInterviews } });
      break;
    }
    case "dates": {
      await db.update(engagements).set({ startsOn: op.startsOn, endsOn: op.endsOn }).where(eq(engagements.id, id));
      break;
    }
    case "expense": {
      await db.insert(caseExpenses).values({ engagementId: id, category: op.category, description: op.description, amount: op.amount, spentOn: op.spentOn, createdBy: auth.user.id });
      break;
    }
    case "guide": {
      const match = and(eq(runningGuides.engagementId, id), op.typeId ? eq(runningGuides.typeId, op.typeId) : isNull(runningGuides.typeId));
      const existing = await db.query.runningGuides.findFirst({ where: match });
      if (existing) await db.update(runningGuides).set({ body: op.body, updatedAt: new Date() }).where(eq(runningGuides.id, existing.id));
      else await db.insert(runningGuides).values({ engagementId: id, typeId: op.typeId, body: op.body });
      break;
    }
    case "delete": {
      const table = { type: expertTypes, topic: expertTopics, hypothesis: hypotheses, expense: caseExpenses }[op.what];
      await db.delete(table).where(and(eq(table.id, op.id), eq(table.engagementId, id)));
      break;
    }
  }
  return NextResponse.json({ ok: true });
}
