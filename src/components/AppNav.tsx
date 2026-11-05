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
      <form method="post" action="/api/auth/logout" style={{ marginTop: "auto" }}>
        <button type="submit" style={{ background: "transparent", color: "var(--nav-ink)", border: "1px solid #2b3a48", width: "100%" }}>
          Sign out
        </button>
      </form>
    </nav>
  );
}
