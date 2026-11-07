import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { firmMembers, firmRoles } from "@/db/schema";
import { canSwitchOwnTitle, getSessionUser } from "@/lib/session";

const body = z.object({ firmRoleId: z.string().min(1) });

/** Switches the caller's own title (admins and test accounts only), which changes their view. */
export async function POST(req: Request) {
  const db = getDb();
  const user = await getSessionUser(db);
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  if (!canSwitchOwnTitle(user)) {
    return NextResponse.json({ error: "Ask your firm's Merqado admin to change your title." }, { status: 403 });
  }
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pick a title." }, { status: 400 });
  const role = await db.query.firmRoles.findFirst({
    where: and(eq(firmRoles.id, parsed.data.firmRoleId), eq(firmRoles.firmId, user.firmId)),
  });
  if (!role) return NextResponse.json({ error: "That title isn't in your firm." }, { status: 400 });
  await db
    .update(firmMembers)
    .set({ firmRoleId: role.id })
    .where(and(eq(firmMembers.firmId, user.firmId), eq(firmMembers.userId, user.id)));
  return NextResponse.json({ title: role.title });
}
