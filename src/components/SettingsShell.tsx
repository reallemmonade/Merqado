import Link from "next/link";
import { getDb } from "@/db/client";
import { getEngagementAccess, type SessionUser } from "@/lib/session";
import { initials } from "@/lib/prefs";
import { safeReturnPath } from "@/lib/return-path";
import { SettingsClose } from "./SettingsClose";

export type SettingsSection = "profile" | "appearance" | "storage";

const SECTIONS: { key: SettingsSection; label: string; href: string }[] = [
  { key: "profile", label: "Profile", href: "/settings" },
  { key: "appearance", label: "Appearance", href: "/settings/appearance" },
  { key: "storage", label: "Storage", href: "/settings/storage" },
];

/** Where "back" goes: the case you came from (by name), else all cases. */
async function backLabel(user: SessionUser, back: string): Promise<string> {
  const id = /^\/e\/([^/?#]+)/.exec(back)?.[1];
  if (!id) return "All cases";
  const found = await getEngagementAccess(getDb(), user, decodeURIComponent(id));
  return found?.engagement.clientName ?? "All cases";
}

/** Settings has its own side menu in place of the app's: back, sections, you, sign out. */
export async function SettingsShell({
  user,
  section,
  from,
  children,
}: {
  user: SessionUser;
  section: SettingsSection;
  from?: string;
  children: React.ReactNode;
}) {
  const back = safeReturnPath(from);
  const label = await backLabel(user, back);
  const q = from ? `?from=${encodeURIComponent(back)}` : "";
  return (
    <div className="shell">
      <nav className="nav settings-nav" aria-label="Settings">
        <Link href={back} className="nav-back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
          {label}
        </Link>
        <div className="case-name">Settings</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {SECTIONS.map((s) => (
            <Link key={s.key} href={s.href + q} className="nav-item" aria-current={s.key === section ? "page" : undefined}>
              {s.label}
            </Link>
          ))}
        </div>
        <div className="nav-foot">
          <div className="nav-user">
            <span className="avatar" aria-hidden="true">
              {initials(user.name)}
            </span>
            <span className="nav-user-name">{user.name}</span>
          </div>
          <form method="post" action="/api/auth/logout">
            <button type="submit" className="nav-signout">
              Sign out
            </button>
          </form>
        </div>
      </nav>
      <main className={`main settings settings-${section}`}>
        <header className="settings-head">
          <h1 style={{ fontSize: 28 }}>{SECTIONS.find((s) => s.key === section)?.label}</h1>
          <SettingsClose from={back} />
        </header>
        {children}
      </main>
    </div>
  );
}
