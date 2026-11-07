import Link from "next/link";
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
      <div style={{ marginTop: "auto" }}>
        <NavUser />
      </div>
    </nav>
  );
}
