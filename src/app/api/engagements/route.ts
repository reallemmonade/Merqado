import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { ARCHETYPES, chatRooms, engagementMembers, engagements, firmMembers } from "@/db/schema";
import { seedSampleExperts } from "@/lib/experts/sample";
import { loadMembers } from "@/lib/case/page";
import { seedCaseWorkspace } from "@/lib/case/sample";
import { roomRows, teamRowsToAdd } from "@/lib/onboarding/newcase";
import { getSessionUser } from "@/lib/session";

const body = z.object({
  clientName: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  sample: z.boolean().optional(),
  /** People added at setup, with their role on this case (null keeps their firm title). */
  team: z.array(z.object({ userId: z.string().min(1).max(64), caseRole: z.enum(ARCHETYPES).nullable() })).max(50).optional(),
  /** Team chat rooms picked at setup, by template name. */
  rooms: z.array(z.string().max(80)).max(20).optional(),
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
  const picked = parsed.data.team ?? [];
  if (picked.length) {
    const inFirm = await db
      .select({ userId: firmMembers.userId })
      .from(firmMembers)
      .where(and(eq(firmMembers.firmId, user.firmId), inArray(firmMembers.userId, picked.map((p) => p.userId))));
    const rows = teamRowsToAdd(picked, new Set(inFirm.map((r) => r.userId)), user.id);
    if (rows.length) {
      await db
        .insert(engagementMembers)
        .values(rows.map((r) => ({ engagementId: eng!.id, userId: r.userId, access: "editor" as const, caseRole: r.caseRole })))
        .onConflictDoNothing();
    }
  }
  // The sample seeds every room itself.
  if (parsed.data.rooms && !parsed.data.sample) {
    const rooms = roomRows(eng!.id, parsed.data.rooms, user.id);
    if (rooms.length) await db.insert(chatRooms).values(rooms);
  }
  if (parsed.data.sample) {
    await seedSampleExperts(db, eng!.id);
    await seedCaseWorkspace(db, eng!.id, await loadMembers(eng!.id, user.firmId), user.id);
  }
  return NextResponse.json({ id: eng!.id });
}
