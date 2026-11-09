import { and, asc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { engagementMembers, engagements, firmMembers, firmRoles, users, type Archetype } from "@/db/schema";
import { allows } from "@/lib/roles";
import { getEngagementAccess, getSessionUser } from "@/lib/session";
import { gptName } from "./names";

export interface CaseMember {
  id: string;
  name: string;
  /** Role on this case: caseRole if set, else from the firm title. */
  archetype: Archetype;
  caseRole: Archetype | null;
  firmArchetype: Archetype;
  title: string;
}

/** Shared by every case page: signs in, checks access, loads the nav and the team. */
export async function loadCase(id: string, path = "") {
  const db = getDb();
  const signedIn = await getSessionUser(db);
  if (!signedIn) redirect(`/login?returnTo=/e/${id}${path}`);
  const membership = await getEngagementAccess(db, signedIn, id);
  if (!membership || !allows(membership, "read")) notFound();
  // On a case, the person's role there (not their firm title) decides views, chats and rights.
  const user = { ...signedIn, archetype: membership.role };
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
    role: membership.role,
    membership,
    canEdit: allows(membership, "edit_findings"),
    navRows,
    members,
    gpt: gptName(membership.engagement.clientName),
  };
}

export type CaseContext = Awaited<ReturnType<typeof loadCase>>;

export async function loadMembers(engagementId: string, firmId: string): Promise<CaseMember[]> {
  const db = getDb();
  const rows = await db
    .select({ id: users.id, name: users.name, archetype: firmRoles.archetype, caseRole: engagementMembers.caseRole, title: firmRoles.title, rank: firmRoles.rank })
    .from(engagementMembers)
    .innerJoin(users, eq(users.id, engagementMembers.userId))
    .innerJoin(firmMembers, eq(firmMembers.userId, users.id))
    .innerJoin(firmRoles, eq(firmRoles.id, firmMembers.firmRoleId))
    .where(and(eq(engagementMembers.engagementId, engagementId), eq(firmMembers.firmId, firmId)))
    .orderBy(asc(users.name));
  return rows
    .map(({ id, name, archetype, caseRole, title }) => ({ id, name, archetype: caseRole ?? archetype, caseRole, firmArchetype: archetype, title }));
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]![0] : "")).toUpperCase();
}
