import Link from "next/link";
import { Icon } from "./case/icons";
import { NavUser } from "./NavUser";

export interface NavEngagement {
  id: string;
  clientName: string;
  title: string;
}

export function AppNav({
  engagements,
  activeId,
  section,
  page,
  needsYou = 0,
}: {
  engagements: NavEngagement[];
  activeId?: string;
  /** The part of the engagement being viewed, when it isn't the overview. */
  section?: "experts";
  /** The top-level page open, if any. */
  page?: "home" | "inbox";
  /** Open Needs-you items, for the badge. */
  needsYou?: number;
}) {
  return (
    <nav className="nav" aria-label="Main">
      <Link href="/" className="brand" style={{ padding: 0 }}>
        Merqado
      </Link>
      <div className="nav-top">
        <Link href="/inbox" className="nav-item" aria-current={page === "inbox" ? "page" : undefined}>
          <Icon name="inbox" />
          <span className="nav-label">Needs you</span>
          {needsYou > 0 && <span className="nav-badge">{needsYou > 99 ? "99+" : needsYou}</span>}
        </Link>
        <Link href="/" className="nav-item nav-home" aria-current={page === "home" ? "page" : undefined}>
          <Icon name="overview" />
          <span className="nav-label">Cases</span>
        </Link>
      </div>
      <div className="nav-cases">
        <div className="eyebrow">Cases</div>
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
        {engagements.length === 0 && <p className="muted">No cases</p>}
      </div>
      <div className="nav-foot">
        <NavUser />
      </div>
    </nav>
  );
}
