import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { engagementMembers, engagements } from "@/db/schema";
import { AppNav } from "@/components/AppNav";
import { NewEngagement } from "@/components/NewEngagement";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATUS = { active: "Active", paused: "Paused", closed: "Closed" } as const;

export default async function Home() {
  const db = getDb();
  const user = await getSessionUser(db);
  if (!user) redirect("/welcome");

  const rows = await db
    .select({ id: engagements.id, clientName: engagements.clientName, title: engagements.title, status: engagements.status })
    .from(engagements)
    .innerJoin(engagementMembers, eq(engagementMembers.engagementId, engagements.id))
    .where(eq(engagementMembers.userId, user.id))
    .orderBy(desc(engagements.createdAt));


  return (
    <div className="shell">
      <AppNav engagements={rows} />
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
          <NewEngagement />
        </section>
      </main>
    </div>
  );
}
