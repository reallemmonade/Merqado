import { CopyButton } from "@/components/CopyButton";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { count, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { engagementMembers, engagements, findings, sources } from "@/db/schema";
import { AppNav } from "@/components/AppNav";
import { AskBox } from "@/components/AskBox";
import { can } from "@/lib/roles";
import { getEngagementAccess, getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  supported: "Supported",
  needs_data: "Needs data",
  contradicted: "Contradicted",
  hypothesis: "Hypothesis",
};

export default async function EngagementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const user = await getSessionUser(db);
  if (!user) redirect(`/login?returnTo=/e/${id}`);
  const membership = await getEngagementAccess(db, user, id);
  if (!membership || !can(membership.access, "read")) notFound();
  const { engagement } = membership;

  const [navRows, [sourceCount], [findingCount], latest] = await Promise.all([
    db
      .select({ id: engagements.id, clientName: engagements.clientName, title: engagements.title })
      .from(engagements)
      .innerJoin(engagementMembers, eq(engagementMembers.engagementId, engagements.id))
      .where(eq(engagementMembers.userId, user.id)),
    db.select({ n: count() }).from(sources).where(eq(sources.engagementId, id)),
    db.select({ n: count() }).from(findings).where(eq(findings.engagementId, id)),
    db.select().from(findings).where(eq(findings.engagementId, id)).orderBy(desc(findings.createdAt)).limit(8),
  ]);

  return (
    <div className="shell">
      <AppNav engagements={navRows} activeId={id} />
      <main className="main">
        <header>
          <div className="muted">
            {engagement.clientName}
          </div>
          <h1 style={{ fontSize: 30 }}>{engagement.title}</h1>
        </header>

        <nav className="subtabs" aria-label="Engagement sections">
          <Link href={`/e/${id}`} aria-current="page">
            Overview
          </Link>
          <Link href={`/e/${id}/experts`}>Experts</Link>
        </nav>

        <section className="tiles copyable" aria-label="Status">
          <CopyButton
            tables={[
              {
                title: engagement.title,
                columns: ["Item", "Count"],
                rows: [
                  ["Findings", findingCount?.n ?? 0],
                  ["Sources", sourceCount?.n ?? 0],
                ],
              },
            ]}
          />
          <div className="card">
            <span className="muted">Findings</span>
            <span className="tile-value">{findingCount?.n ?? 0}</span>
          </div>
          <div className="card">
            <span className="muted">Sources</span>
            <span className="tile-value">{sourceCount?.n ?? 0}</span>
          </div>
          <div className="card">
            <span className="muted">Your access</span>
            <span className="tile-value" style={{ fontSize: 20 }}>{membership.access}</span>
          </div>
        </section>

        <AskBox engagementId={id} />

        <section className="card">
          <h2 style={{ fontSize: 18 }}>Latest findings</h2>
          {latest.map((f) => (
            <div className="row" key={f.id}>
              <span>{f.statement}</span>
              <span className={`status-${f.status}`}>{STATUS_LABEL[f.status]}</span>
            </div>
          ))}
          {latest.length === 0 && <p className="muted">No findings</p>}
        </section>
      </main>
    </div>
  );
}
