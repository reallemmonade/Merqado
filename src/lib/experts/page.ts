import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { allows } from "@/lib/roles";
import { getEngagementAccess, getSessionUser } from "@/lib/session";
import { loadMembers } from "@/lib/case/page";
import { loadExperts } from "./data";
import { guessRequester } from "./requester";

/** Shared by every Experts page: checks access and loads the engagement's expert data. */
export async function loadExpertsPage(id: string) {
  const db = getDb();
  const user = await getSessionUser(db);
  if (!user) redirect(`/login?returnTo=/e/${id}/experts`);
  const membership = await getEngagementAccess(db, user, id);
  if (!membership || !allows(membership, "read")) notFound();
  const [data, members, suggestedRequester] = await Promise.all([
    loadExperts(db, id),
    loadMembers(id, membership.engagement.firmId),
    guessRequester(db, id, user.id),
  ]);
  return {
    me: user.id,
    members: members.map((m) => ({ id: m.id, name: m.name, archetype: m.archetype })),
    suggestedRequester,
    db,
    user,
    engagement: membership.engagement,
    data,
    canEdit: allows(membership, "edit_experts"),
    canApprove: allows(membership, "approve_experts"),
  };
}
