import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { engagementMembers, engagements, firmMembers, firmRoles, firms, users } from "@/db/schema";
import { AppNav } from "@/components/AppNav";
import { NewEngagement } from "@/components/NewEngagement";
import { needsYouCount } from "@/lib/inbox/status";
import { parseStandard } from "@/lib/onboarding/model";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATUS = { active: "Active", paused: "Paused", closed: "Closed" } as const;

export default async function Home() {
  const db = getDb();
  const user = await getSessionUser(db);
  if (!user) redirect("/welcome");

  const [rows, needsYou, people, firm] = await Promise.all([
    db
      .select({ id: engagements.id, clientName: engagements.clientName, title: engagements.title, status: engagements.status })
      .from(engagements)
      .innerJoin(engagementMembers, eq(engagementMembers.engagementId, engagements.id))
      .where(eq(engagementMembers.userId, user.id))
      .orderBy(desc(engagements.createdAt)),
    needsYouCount(db, user.id),
    db
      .select({ id: users.id, name: users.name, archetype: firmRoles.archetype })
      .from(firmMembers)
      .innerJoin(users, eq(users.id, firmMembers.userId))
      .innerJoin(firmRoles, eq(firmRoles.id, firmMembers.firmRoleId))
      .where(eq(firmMembers.firmId, user.firmId))
      .orderBy(asc(users.name)),
    db.query.firms.findFirst({ where: eq(firms.id, user.firmId), columns: { onboardingStandard: true } }),
  ]);
  const standard = parseStandard(firm?.onboardingStandard);

  return (
    <div className="shell">
      <AppNav engagements={rows} page="home" needsYou={needsYou} />
      <main className="main">
        <header>
          <div className="muted">
            {user.title}
          </div>
          <h1 style={{ fontSize: 30 }}>Good to see you, {user.name.split(" ")[0]}</h1>
        </header>
        <section className="card">
          <h2 style={{ fontSize: 18 }}>Cases</h2>
          {rows.map((e) => (
            <div className="row" key={e.id}>
              <Link href={`/e/${e.id}`}>
                {e.clientName} · {e.title}
              </Link>
              <span className="muted">{STATUS[e.status]}</span>
            </div>
          ))}
          {rows.length === 0 && <p className="muted">No cases</p>}
          <NewEngagement me={user.id} people={people} standard={standard} />
        </section>
      </main>
    </div>
  );
}
