import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { engagementMembers, engagements } from "@/db/schema";
import { AppNav } from "@/components/AppNav";
import { PERSONA_HOME } from "@/lib/roles";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const db = getDb();
  const user = await getSessionUser(db);
  if (!user) {
    return (
      <main className="main" style={{ maxWidth: 640, margin: "0 auto" }}>
        <h1>Sign in to Merqado</h1>
        <p className="muted">
          Single sign-on is not set up yet. For local development, set DEV_USER_EMAIL to a seeded user and run
          <code> npm run db:seed</code>.
        </p>
      </main>
    );
  }

  const rows = await db
    .select({ id: engagements.id, clientName: engagements.clientName, title: engagements.title, status: engagements.status })
    .from(engagements)
    .innerJoin(engagementMembers, eq(engagementMembers.engagementId, engagements.id))
    .where(eq(engagementMembers.userId, user.id));

  const home = PERSONA_HOME[user.archetype];

  return (
    <div className="shell">
      <AppNav engagements={rows} />
      <main className="main">
        <header>
          <div className="muted">
            {user.title} · {home.label}
          </div>
          <h1 style={{ fontSize: 30 }}>Good to see you, {user.name.split(" ")[0]}</h1>
        </header>
        <section className="card">
          <h2 style={{ fontSize: 18 }}>Your engagements</h2>
          {rows.map((e) => (
            <div className="row" key={e.id}>
              <Link href={`/e/${e.id}`}>
                {e.clientName} · {e.title}
              </Link>
              <span className="muted">{e.status}</span>
            </div>
          ))}
          {rows.length === 0 && <p className="muted">You are not on any engagements yet.</p>}
        </section>
      </main>
    </div>
  );
}
