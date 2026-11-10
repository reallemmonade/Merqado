import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { NavTitleSwitch } from "@/components/NavTitleSwitch";
import { SettingsShell } from "@/components/SettingsShell";
import { initials } from "@/lib/prefs";
import { getSessionUser } from "@/lib/session";

const DESKTOP = "https://github.com/reallemmonade/Merqado/releases/download/desktop";

export const dynamic = "force-dynamic";

export default async function SettingsProfilePage({ searchParams }: { searchParams: Promise<{ from?: string | string[] }> }) {
  const { from } = await searchParams;
  const user = await getSessionUser(getDb());
  if (!user) redirect("/welcome");
  const hideDesktopApp = /Electron\/|iPhone|iPad|Android/.test((await headers()).get("user-agent") ?? "");

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
      {!hideDesktopApp && (
        <section className="card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <strong>Desktop app</strong>
            <div style={{ display: "flex", gap: 8 }}>
              <a className="button" href={`${DESKTOP}/Merqado-mac-universal.dmg`} style={{ display: "inline-flex", alignItems: "center", textDecoration: "none", color: "var(--btn-ink, #fff)" }}>
                Mac
              </a>
              <a className="button" href={`${DESKTOP}/Merqado-windows-setup.exe`} style={{ display: "inline-flex", alignItems: "center", textDecoration: "none", color: "var(--btn-ink, #fff)" }}>
                Windows
              </a>
            </div>
          </div>
        </section>
      )}
    </SettingsShell>
  );
}
