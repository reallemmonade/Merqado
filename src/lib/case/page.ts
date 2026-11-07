import { and, asc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { engagementMembers, engagements, firmMembers, firmRoles, users, type Archetype } from "@/db/schema";
import { can } from "@/lib/roles";
import { getEngagementAccess, getSessionUser } from "@/lib/session";
import { gptName } from "./names";

export interface CaseMember {
  id: string;
  name: string;
  archetype: Archetype;
  title: string;
}

/** Shared by every case page: signs in, checks access, loads the nav and the team. */
export async function loadCase(id: string, path = "") {
  const db = getDb();
  const user = await getSessionUser(db);
  if (!user) redirect(`/login?returnTo=/e/${id}${path}`);
  const membership = await getEngagementAccess(db, user, id);
  if (!membership || !can(membership.access, "read")) notFound();
  const [navRows, members] = await Promise.all([
    db
      .select({ id: engagements.id, clientName: engagements.clientName, title: engagements.title })
      .from(engagements)
      .innerJoin(engagementMembers, eq(engagementMembers.engagementId, engagements.id))
      .where(eq(engagementMembers.userId, user.id)),
    loadMembers(id, user.firmId),
  ]);
  return {
    db,
    user,
    engagement: membership.engagement,
    access: membership.access,
    canEdit: can(membership.access, "edit_findings"),
    navRows,
    members,
    gpt: gptName(membership.engagement.clientName),
  };
}

export type CaseContext = Awaited<ReturnType<typeof loadCase>>;

export async function loadMembers(engagementId: string, firmId: string): Promise<CaseMember[]> {
  const db = getDb();
  const rows = await db
    .select({ id: users.id, name: users.name, archetype: firmRoles.archetype, title: firmRoles.title, rank: firmRoles.rank })
    .from(engagementMembers)
    .innerJoin(users, eq(users.id, engagementMembers.userId))
    .innerJoin(firmMembers, eq(firmMembers.userId, users.id))
    .innerJoin(firmRoles, eq(firmRoles.id, firmMembers.firmRoleId))
    .where(and(eq(engagementMembers.engagementId, engagementId), eq(firmMembers.firmId, firmId)))
    .orderBy(asc(users.name));
  return rows
    .map(({ id, name, archetype, title }) => ({ id, name, archetype, title }));
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]![0] : "")).toUpperCase();
}
