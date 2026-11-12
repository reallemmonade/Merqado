import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { experts } from "@/db/schema";
import { authorize, badRequest } from "@/lib/experts/api";
import { findExpert } from "@/lib/experts/data";
import { expertPatch } from "@/lib/experts/schemas";
import { loadMembers } from "@/lib/case/page";
import { canPass, isApproved, parseApprovals, signoffFor } from "@/lib/experts/approval";

type Ctx = { params: Promise<{ id: string; expertId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id, expertId } = await params;
  const auth = await authorize(id, "edit_experts");
  if (auth instanceof NextResponse) return auth;
  const current = await findExpert(auth.db, id, expertId);
  if (!current) return NextResponse.json({ error: "Expert not found." }, { status: 404 });
  const parsed = expertPatch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Some of those values aren't valid.");
  const { topicIds, guide, requestedBy, ...rest } = parsed.data;

  const update: Partial<typeof experts.$inferInsert> = { ...rest };
  if (topicIds) update.topicIds = JSON.stringify(topicIds);
  if (guide !== undefined) {
    update.guide = guide;
    update.guideUpdatedAt = new Date();
  }
  const members = await loadMembers(id, auth.engagement.firmId);
  const state = { requestedBy: current.requestedBy, approvals: parseApprovals(current.approvals) };
  if (requestedBy !== undefined && requestedBy !== current.requestedBy) {
    if (current.status !== "proposed") return badRequest("Only proposed experts can change who asked.");
    if (requestedBy && !members.some((m) => m.id === requestedBy)) return badRequest("Pick someone on this case.");
    update.requestedBy = requestedBy;
    state.requestedBy = requestedBy;
  }

  if (rest.status && current.status === "declined" && rest.status !== "proposed" && rest.status !== "declined") {
    return badRequest("Move it back to proposed first.");
  }
  if (rest.status === "declined" && current.status === "proposed") {
    if (!canPass(state, auth.user.id, members)) {
      return NextResponse.json({ error: "Only the consultant or whoever asked can pass." }, { status: 403 });
    }
  } else if (rest.status === "proposed" && current.status !== "proposed") {
    // Back to proposed starts the sign-offs over.
    update.approvals = "[]";
    update.approvedBy = null;
  } else if (rest.status && current.status === "proposed" && rest.status !== "proposed") {
    // Approving (or jumping ahead) is a sign-off; the expert moves on only once everyone needed has signed.
    if (!signoffFor(state, auth.user.id, members)) {
      return NextResponse.json({ error: "You can't approve this expert." }, { status: 403 });
    }
    state.approvals = [...state.approvals, auth.user.id];
    update.approvals = JSON.stringify(state.approvals);
    if (isApproved(state, members)) update.approvedBy = auth.user.id;
    else delete update.status;
  }
  if (Object.keys(update).length) await auth.db.update(experts).set(update).where(eq(experts.id, expertId));
  return NextResponse.json({ ok: true, status: update.status ?? current.status });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id, expertId } = await params;
  const auth = await authorize(id, "edit_experts");
  if (auth instanceof NextResponse) return auth;
  const current = await findExpert(auth.db, id, expertId);
  if (!current) return NextResponse.json({ error: "Expert not found." }, { status: 404 });
  await auth.db.delete(experts).where(eq(experts.id, expertId));
  return NextResponse.json({ ok: true });
}
