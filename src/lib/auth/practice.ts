import { and, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { engagementMembers, engagements, firmMembers, firmRoles, firms, users } from "@/db/schema";
import { DEFAULT_FIRM_ROLES } from "@/lib/roles";

/**
 * Practice sign-in: typing PRACTICE_CODE in the work email box signs in to a separate
 * practice firm, with no access to any other firm or case. The practice user is that firm's
 * partner and admin so every feature works.
 *
 * On unless PRACTICE_LOGIN_ENABLED is "false" (or 0 / off / no). Temporary: remove when done.
 */
export const PRACTICE_CODE = "xxxx";
export const PRACTICE_EMAIL = "practice@practice.invalid";
export const PRACTICE_FIRM_SLUG = "merqado-practice";

type Env = Record<string, string | undefined>;

export function practiceLoginEnabled(env: Env = process.env): boolean {
  return !/^(false|0|off|no)$/i.test(env.PRACTICE_LOGIN_ENABLED?.trim() ?? "");
}

export function isPracticeCode(input: string, env: Env = process.env): boolean {
  return practiceLoginEnabled(env) && input.trim().toLowerCase() === PRACTICE_CODE;
}

/** Creates the practice firm, user and first case if missing. Safe to run on every sign-in. */
export async function ensurePracticeUser(db: DB): Promise<{ userId: string; firmId: string }> {
  let firm = await db.query.firms.findFirst({ where: eq(firms.slug, PRACTICE_FIRM_SLUG) });
  if (!firm) {
    [firm] = await db.insert(firms).values({ name: "Practice", slug: PRACTICE_FIRM_SLUG }).returning();
    await db.insert(firmRoles).values(DEFAULT_FIRM_ROLES.map((r) => ({ ...r, firmId: firm!.id })));
  }
  const firmId = firm!.id;
  const roles = await db.query.firmRoles.findMany({ where: eq(firmRoles.firmId, firmId) });
  const partner = roles.find((r) => r.archetype === "partner") ?? [...roles].sort((a, b) => b.rank - a.rank)[0]!;

  let user = await db.query.users.findFirst({ where: eq(users.email, PRACTICE_EMAIL) });
  if (!user) [user] = await db.insert(users).values({ email: PRACTICE_EMAIL, name: "Practice" }).returning();
  const userId = user!.id;

  const member = await db.query.firmMembers.findFirst({
    where: and(eq(firmMembers.firmId, firmId), eq(firmMembers.userId, userId)),
  });
  if (!member) {
    await db.insert(firmMembers).values({ firmId, userId, firmRoleId: partner.id, isAdmin: true });
  } else if (!member.isAdmin) {
    await db
      .update(firmMembers)
      .set({ isAdmin: true })
      .where(and(eq(firmMembers.firmId, firmId), eq(firmMembers.userId, userId)));
  }

  const existing = await db.query.engagements.findFirst({ where: eq(engagements.firmId, firmId) });
  if (!existing) {
    const [eng] = await db
      .insert(engagements)
      .values({ firmId, clientName: "Client", title: "Project Practice" })
      .returning({ id: engagements.id });
    await db.insert(engagementMembers).values({ engagementId: eng!.id, userId, access: "lead" });
  }
  return { userId, firmId };
}
