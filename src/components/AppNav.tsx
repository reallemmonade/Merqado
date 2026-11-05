import Link from "next/link";

export interface NavEngagement {
  id: string;
  clientName: string;
  title: string;
}

export function AppNav({ engagements, activeId }: { engagements: NavEngagement[]; activeId?: string }) {
  return (
    <nav className="nav" aria-label="Main">
      <Link href="/" className="brand" style={{ padding: 0 }}>
        merqado
      </Link>
      <div>
        <div className="eyebrow">Engagements</div>
        {engagements.map((e) => (
          <Link key={e.id} href={`/e/${e.id}`} aria-current={e.id === activeId ? "page" : undefined}>
            {e.clientName} · {e.title}
          </Link>
        ))}
        {engagements.length === 0 && <p className="muted">No engagements yet.</p>}
      </div>
    </nav>
  );
}
