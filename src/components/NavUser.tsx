import Link from "next/link";
import { getDb } from "@/db/client";
import { initials } from "@/lib/prefs";
import { getSessionUser } from "@/lib/session";
import { Icon } from "./case/icons";

/** Sidebar footer: the signed-in person and the way into Settings. */
export async function NavUser({ compact = false }: { compact?: boolean }) {
  const user = await getSessionUser(getDb());
  if (!user) return null;
  if (compact) {
    return (
      <Link href="/settings" className="rail-user" aria-label="Settings" title={`${user.name} · Settings`}>
        <span className="avatar">{initials(user.name)}</span>
      </Link>
    );
  }
  return (
    <div className="nav-user">
      <span className="avatar" aria-hidden="true">
        {initials(user.name)}
      </span>
      <span className="nav-user-name">{user.name}</span>
      <Link href="/settings" className="nav-gear" aria-label="Settings" title="Settings">
        <Icon name="settings" />
      </Link>
    </div>
  );
}
