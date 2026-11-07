import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { NavTitleSwitch } from "@/components/NavTitleSwitch";
import { SettingsShell } from "@/components/SettingsShell";
import { initials } from "@/lib/prefs";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SettingsProfilePage({ searchParams }: { searchParams: Promise<{ from?: string | string[] }> }) {
  const { from } = await searchParams;
  const user = await getSessionUser(getDb());
  if (!user) redirect("/welcome");

  return (
    <SettingsShell user={user} section="profile" from={typeof from === "string" ? from : undefined}>
      <section className="card">
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
    </SettingsShell>
  );
}
