import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { keyTakeaways } from "@/db/schema";
import { authorize, badRequest } from "@/lib/experts/api";
import { takeawayFields } from "@/lib/experts/schemas";

type Ctx = { params: Promise<{ id: string; takeawayId: string }> };
const where = (id: string, takeawayId: string) => and(eq(keyTakeaways.id, takeawayId), eq(keyTakeaways.engagementId, id));

/** Edit a takeaway, including whether it counts toward the hypotheses. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id, takeawayId } = await params;
  const auth = await authorize(id, "edit_experts");
  if (auth instanceof NextResponse) return auth;
  const parsed = takeawayFields.partial().safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Some of those values aren't valid.");
  const res = await auth.db.update(keyTakeaways).set(parsed.data).where(where(id, takeawayId)).returning({ id: keyTakeaways.id });
  if (!res.length) return NextResponse.json({ error: "Takeaway not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id, takeawayId } = await params;
  const auth = await authorize(id, "edit_experts");
  if (auth instanceof NextResponse) return auth;
  await auth.db.delete(keyTakeaways).where(where(id, takeawayId));
  return NextResponse.json({ ok: true });
}
