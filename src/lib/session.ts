import { and, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { engagementMembers, engagements, firmMembers, firmRoles, users, type AccessLevel, type Archetype } from "@/db/schema";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  firmId: string;
  title: string;
  archetype: Archetype;
  isAdmin: boolean;
}

/**
 * Temporary: signs in as DEV_USER_EMAIL outside production.
 * Replace with SSO (SAML/OIDC per firm) before any client data goes in.
 */
export async function getSessionUser(db: DB): Promise<SessionUser | null> {
  if (process.env.NODE_ENV === "production") return null;
  const email = process.env.DEV_USER_EMAIL;
  if (!email) return null;

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      firmId: firmMembers.firmId,
      title: firmRoles.title,
      archetype: firmRoles.archetype,
      isAdmin: firmMembers.isAdmin,
    })
    .from(users)
    .innerJoin(firmMembers, eq(firmMembers.userId, users.id))
    .innerJoin(firmRoles, eq(firmRoles.id, firmMembers.firmRoleId))
    .where(eq(users.email, email))
    .limit(1);
  return row ?? null;
}

/** The user's access on an engagement in their own firm, or null. */
export async function getEngagementAccess(
  db: DB,
  user: SessionUser,
  engagementId: string,
): Promise<{ engagement: typeof engagements.$inferSelect; access: AccessLevel } | null> {
  const [row] = await db
    .select({ engagement: engagements, access: engagementMembers.access })
    .from(engagements)
    .innerJoin(
      engagementMembers,
      and(eq(engagementMembers.engagementId, engagements.id), eq(engagementMembers.userId, user.id)),
    )
    .where(and(eq(engagements.id, engagementId), eq(engagements.firmId, user.firmId)))
    .limit(1);
  return row ?? null;
}
