import Link from "next/link";

/** Shell for pages anyone can read without signing in. */
export function PublicPage({ children, narrow }: { children: React.ReactNode; narrow?: boolean }) {
  return (
    <div className="public" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          padding: "16px 24px",
          borderBottom: "1px solid var(--line)",
          background: "var(--surface)",
        }}
      >
        <Link href="/welcome" className="brand" style={{ textDecoration: "none" }}>
          Merqado
        </Link>
        <Link href="/login" className="button" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
          Sign in
        </Link>
      </header>
      <main className="main" style={{ maxWidth: narrow ? 720 : 960, margin: "0 auto", width: "100%", flex: 1 }}>
        {children}
      </main>
      <footer className="muted" style={{ padding: "24px", display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
        <span>© {new Date().getFullYear()} Merqado</span>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <a href="mailto:maxam@guava.ventures">Contact</a>
      </footer>
    </div>
  );
}
