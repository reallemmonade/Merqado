import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { engagementMembers, engagements } from "@/db/schema";
import { AppNav } from "@/components/AppNav";
import { NavTitleSwitch } from "@/components/NavTitleSwitch";
import { SettingsClose } from "@/components/SettingsClose";
import { SettingsForm } from "@/components/SettingsForm";
import { initials } from "@/lib/prefs";
import { getPrefs } from "@/lib/prefs.server";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ from?: string | string[] }> }) {
  const { from } = await searchParams;
  const db = getDb();
  const user = await getSessionUser(db);
  if (!user) redirect("/welcome");

  const [rows, prefs] = await Promise.all([
    db
      .select({ id: engagements.id, clientName: engagements.clientName, title: engagements.title })
      .from(engagements)
      .innerJoin(engagementMembers, eq(engagementMembers.engagementId, engagements.id))
      .where(eq(engagementMembers.userId, user.id)),
    getPrefs(),
  ]);

  return (
    <div className="shell">
      <AppNav engagements={rows} />
      <main className="main settings">
        <header className="settings-head">
          <h1 style={{ fontSize: 28 }}>Settings</h1>
          <SettingsClose from={typeof from === "string" ? from : undefined} />
        </header>

        <section className="card">
          <h2 style={{ fontSize: 18 }}>Profile</h2>
          <div className="profile">
            <span className="avatar avatar-lg" aria-hidden="true">
              {initials(user.name)}
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <strong style={{ fontSize: 16 }}>{user.name}</strong>
              <span className="muted">{user.email}</span>
              <span className="muted">{user.title}</span>
            </div>
          </div>
          <NavTitleSwitch />
        </section>

        <SettingsForm initial={prefs} />

        <section className="card">
          <form method="post" action="/api/auth/logout">
            <button type="submit" className="secondary">
              Sign out
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
