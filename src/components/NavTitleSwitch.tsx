import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { firmRoles } from "@/db/schema";
import { canSwitchOwnTitle, getSessionUser } from "@/lib/session";
import { TitlePicker } from "./TitlePicker";

/** Shown in the side nav to firm admins and personal test accounts. */
export async function NavTitleSwitch() {
  const db = getDb();
  const user = await getSessionUser(db);
  if (!user || !canSwitchOwnTitle(user)) return null;
  const titles = await db
    .select({ id: firmRoles.id, title: firmRoles.title })
    .from(firmRoles)
    .where(eq(firmRoles.firmId, user.firmId))
    .orderBy(asc(firmRoles.rank));
  return <TitlePicker current={user.firmRoleId} titles={titles} />;
}
