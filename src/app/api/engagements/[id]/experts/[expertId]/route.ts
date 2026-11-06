import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { experts } from "@/db/schema";
import { authorize, badRequest } from "@/lib/experts/api";
import { findExpert } from "@/lib/experts/data";
import { expertPatch } from "@/lib/experts/schemas";
import { can } from "@/lib/roles";
import { getEngagementAccess } from "@/lib/session";

type Ctx = { params: Promise<{ id: string; expertId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id, expertId } = await params;
  const auth = await authorize(id, "edit_experts");
  if (auth instanceof NextResponse) return auth;
  const current = await findExpert(auth.db, id, expertId);
  if (!current) return NextResponse.json({ error: "Expert not found." }, { status: 404 });
  const parsed = expertPatch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Some of those values aren't valid.");
  const { topicIds, guide, ...rest } = parsed.data;

  const update: Partial<typeof experts.$inferInsert> = { ...rest };
  if (topicIds) update.topicIds = JSON.stringify(topicIds);
  if (guide !== undefined) {
    update.guide = guide;
    update.guideUpdatedAt = new Date();
  }
  if (rest.status && current.status === "proposed" && rest.status !== "proposed") {
    const membership = await getEngagementAccess(auth.db, auth.user, id);
    if (!can(membership?.access, "approve_experts")) {
      return NextResponse.json({ error: "You can't approve experts on this engagement." }, { status: 403 });
    }
    update.approvedBy = auth.user.id;
  }
  await auth.db.update(experts).set(update).where(eq(experts.id, expertId));
  return NextResponse.json({ ok: true });
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
