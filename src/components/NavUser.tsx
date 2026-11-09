import { getDb } from "@/db/client";
import { initials } from "@/lib/prefs";
import { getSessionUser } from "@/lib/session";
import { Icon } from "./case/icons";
import { SettingsLink } from "./SettingsLink";

/** Sidebar footer: the signed-in person and the way into Settings. */
export async function NavUser({ compact = false }: { compact?: boolean }) {
  const user = await getSessionUser(getDb());
  if (!user) return null;
  if (compact) {
    return (
      <SettingsLink className="rail-user" aria-label="Settings" title={`${user.name} · Settings`}>
        <span className="avatar">{initials(user.name)}</span>
      </SettingsLink>
    );
  }
  return (
    <div className="nav-user">
      <span className="avatar" aria-hidden="true">
        {initials(user.name)}
      </span>
      <span className="nav-user-name">{user.name}</span>
      <SettingsLink className="nav-gear" aria-label="Settings" title="Settings">
        <Icon name="settings" />
      </SettingsLink>
    </div>
  );
}
