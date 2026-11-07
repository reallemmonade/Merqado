import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { engagementMembers, engagements } from "@/db/schema";
import { seedSampleExperts } from "@/lib/experts/sample";
import { loadMembers } from "@/lib/case/page";
import { seedCaseWorkspace } from "@/lib/case/sample";
import { getSessionUser } from "@/lib/session";

const body = z.object({
  clientName: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  sample: z.boolean().optional(),
});

/** Starts an engagement in the caller's firm; the creator leads it. */
export async function POST(req: Request) {
  const db = getDb();
  const user = await getSessionUser(db);
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Add a client name and a title." }, { status: 400 });
  const [eng] = await db
    .insert(engagements)
    .values({ firmId: user.firmId, clientName: parsed.data.clientName, title: parsed.data.title })
    .returning({ id: engagements.id });
  await db.insert(engagementMembers).values({ engagementId: eng!.id, userId: user.id, access: "lead" });
  if (parsed.data.sample) {
    await seedSampleExperts(db, eng!.id);
    await seedCaseWorkspace(db, eng!.id, await loadMembers(eng!.id, user.firmId), user.id);
  }
  return NextResponse.json({ id: eng!.id });
}
