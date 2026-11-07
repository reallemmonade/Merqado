import Link from "next/link";
import { NavTitleSwitch } from "./NavTitleSwitch";

export interface NavEngagement {
  id: string;
  clientName: string;
  title: string;
}

export function AppNav({
  engagements,
  activeId,
  section,
}: {
  engagements: NavEngagement[];
  activeId?: string;
  /** The part of the engagement being viewed, when it isn't the overview. */
  section?: "experts";
}) {
  return (
    <nav className="nav" aria-label="Main">
      <Link href="/" className="brand" style={{ padding: 0 }}>
        merqado
      </Link>
      <div>
        <div className="eyebrow">Engagements</div>
        {engagements.map((e) => (
          <div key={e.id}>
            <Link href={`/e/${e.id}`} aria-current={e.id === activeId && !section ? "page" : undefined}>
              {e.clientName} · {e.title}
            </Link>
            {e.id === activeId && (
              <Link
                href={`/e/${e.id}/experts`}
                aria-current={section === "experts" ? "page" : undefined}
                style={{ paddingLeft: 20 }}
              >
                Experts
              </Link>
            )}
          </div>
        ))}
        {engagements.length === 0 && <p className="muted">No engagements</p>}
      </div>
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
        <NavTitleSwitch />
        <form method="post" action="/api/auth/logout">
          <button type="submit" style={{ background: "transparent", color: "var(--nav-ink)", border: "1px solid #2b3a48", width: "100%" }}>
            Sign out
          </button>
        </form>
      </div>
    </nav>
  );
}
