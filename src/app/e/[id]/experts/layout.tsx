import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { engagementMembers, engagements } from "@/db/schema";
import { AppNav } from "@/components/AppNav";
import { SubTabs } from "@/components/experts/SubTabs";
import { can } from "@/lib/roles";
import { getEngagementAccess, getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ExpertsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const user = await getSessionUser(db);
  if (!user) redirect(`/login?returnTo=/e/${id}/experts`);
  const membership = await getEngagementAccess(db, user, id);
  if (!membership || !can(membership.access, "read")) notFound();
  const navRows = await db
    .select({ id: engagements.id, clientName: engagements.clientName, title: engagements.title })
    .from(engagements)
    .innerJoin(engagementMembers, eq(engagementMembers.engagementId, engagements.id))
    .where(eq(engagementMembers.userId, user.id));

  return (
    <div className="shell">
      <AppNav engagements={navRows} activeId={id} section="experts" />
      <main className="main" style={{ gap: 18 }}>
        <header>
          <div className="muted">
            {membership.engagement.clientName} · {membership.engagement.title}
          </div>
          <h1 style={{ fontSize: 28 }}>Experts</h1>
        </header>
        <SubTabs engagementId={id} />
        {children}
      </main>
    </div>
  );
}
