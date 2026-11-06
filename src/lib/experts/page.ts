import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { can } from "@/lib/roles";
import { getEngagementAccess, getSessionUser } from "@/lib/session";
import { loadExperts } from "./data";

/** Shared by every Experts page: checks access and loads the engagement's expert data. */
export async function loadExpertsPage(id: string) {
  const db = getDb();
  const user = await getSessionUser(db);
  if (!user) redirect(`/login?returnTo=/e/${id}/experts`);
  const membership = await getEngagementAccess(db, user, id);
  if (!membership || !can(membership.access, "read")) notFound();
  const data = await loadExperts(db, id);
  return {
    db,
    user,
    engagement: membership.engagement,
    data,
    canEdit: can(membership.access, "edit_experts"),
    canApprove: can(membership.access, "approve_experts"),
  };
}
