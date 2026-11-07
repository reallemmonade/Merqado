import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { experts } from "@/db/schema";
import { authorize } from "@/lib/experts/api";
import { seedSampleExperts } from "@/lib/experts/sample";
import { loadMembers } from "@/lib/case/page";
import { seedCaseWorkspace } from "@/lib/case/sample";

/** Fills the empty sections of a case with the sample case. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id, "edit_findings");
  if (auth instanceof NextResponse) return auth;
  const { db, user } = auth;
  const added: string[] = [];
  if (!(await db.query.experts.findFirst({ where: eq(experts.engagementId, id) }))) {
    await seedSampleExperts(db, id);
    added.push("experts");
  }
  added.push(...(await seedCaseWorkspace(db, id, await loadMembers(id, user.firmId), user.id)));
  return NextResponse.json({ ok: true, added });
}
