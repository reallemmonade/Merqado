import { and, eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import type { DB } from "@/db/client";
import { findSession, SESSION_COOKIE } from "@/lib/auth/session";
import { findTestAccount } from "@/lib/auth/test-accounts";
import { engagementMembers, engagements, firmMembers, firmRoles, users, type AccessLevel, type Archetype } from "@/db/schema";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  firmId: string;
  firmRoleId: string;
  title: string;
  archetype: Archetype;
  isAdmin: boolean;
  /** IANA time zone from the person's browser; null until first seen. */
  timeZone: string | null;
}

/**
 * The signed-in person, from their SSO session cookie, or from the iPhone app's
 * `Authorization: Bearer <token>` header.
 * Outside production, DEV_USER_EMAIL signs in a seeded user without SSO.
 */
export async function getSessionUser(db: DB): Promise<SessionUser | null> {
  const jar = await cookies();
  const bearer = (await headers()).get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const session = await findSession(db, bearer ?? jar.get(SESSION_COOKIE)?.value);
  if (session) return loadUser(db, eq(users.id, session.userId), session.firmId);

  if (process.env.NODE_ENV === "production") return null;
  const email = process.env.DEV_USER_EMAIL;
  return email ? loadUser(db, eq(users.email, email.toLowerCase())) : null;
}

async function loadUser(db: DB, who: ReturnType<typeof eq>, firmId?: string): Promise<SessionUser | null> {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      firmId: firmMembers.firmId,
      firmRoleId: firmMembers.firmRoleId,
      title: firmRoles.title,
      archetype: firmRoles.archetype,
      isAdmin: firmMembers.isAdmin,
      timeZone: users.timeZone,
    })
    .from(users)
    .innerJoin(firmMembers, eq(firmMembers.userId, users.id))
    .innerJoin(firmRoles, eq(firmRoles.id, firmMembers.firmRoleId))
    .where(firmId ? and(who, eq(firmMembers.firmId, firmId)) : who)
    .limit(1);
  return row ?? null;
}

/** The user's access on an engagement in their own firm, or null. */
export async function getEngagementAccess(
  db: DB,
  user: SessionUser,
  engagementId: string,
): Promise<{ engagement: typeof engagements.$inferSelect; access: AccessLevel; role: Archetype } | null> {
  const [row] = await db
    .select({ engagement: engagements, access: engagementMembers.access, caseRole: engagementMembers.caseRole })
    .from(engagements)
    .innerJoin(
      engagementMembers,
      and(eq(engagementMembers.engagementId, engagements.id), eq(engagementMembers.userId, user.id)),
    )
    .where(and(eq(engagements.id, engagementId), eq(engagements.firmId, user.firmId)))
    .limit(1);
  return row ? { engagement: row.engagement, access: row.access, role: row.caseRole ?? user.archetype } : null;
}

/**
 * Firm admins and personal test accounts can switch their own title from the app to see
 * another persona's view. Titles only shape the view; permissions come from engagement access.
 */
export function canSwitchOwnTitle(user: SessionUser): boolean {
  return user.isAdmin || findTestAccount(user.email) !== null;
}
