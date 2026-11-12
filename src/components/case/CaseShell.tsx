import { Suspense } from "react";
import Link from "next/link";
import { NavUser } from "@/components/NavUser";
import type { CaseContext } from "@/lib/case/page";
import { needsYouCount } from "@/lib/inbox/status";
import { getPrefs } from "@/lib/prefs.server";
import { GptBar } from "./GptBar";
import { HashFocus } from "./HashFocus";
import { Icon, type IconName } from "./icons";
import { Shortcuts } from "./Shortcuts";

export type CaseSection = "overview" | "gpt" | "workplan" | "experts" | "deck" | "channel" | "files" | "dictionary" | "notes" | "search";

function sections(gpt: string): { key: CaseSection; label: string; icon: IconName; href: string }[] {
  return [
    { key: "overview", label: "Overview", icon: "overview", href: "" },
    { key: "gpt", label: gpt, icon: "gpt", href: "/gpt" },
    { key: "workplan", label: "Workplan", icon: "workplan", href: "/workplan" },
    { key: "experts", label: "Experts", icon: "experts", href: "/experts" },
    { key: "deck", label: "Deck", icon: "deck", href: "/deck" },
    { key: "channel", label: "Team channel", icon: "channel", href: "/channel" },
    { key: "files", label: "Files", icon: "files", href: "/files" },
    { key: "dictionary", label: "Dictionary", icon: "dictionary", href: "/dictionary" },
    { key: "notes", label: "Notes", icon: "notes", href: "/notes" },
  ];
}

/**
 * Every case page: the side menu (by default full on the Overview, icons elsewhere), the page
 * itself and the case GPT bar along the bottom.
 */
export async function CaseShell({
  ctx,
  section,
  title,
  actions,
  hideGptBar,
  children,
}: {
  ctx: Pick<CaseContext, "db" | "user" | "engagement" | "gpt" | "navRows">;
  section: CaseSection;
  title?: string;
  actions?: React.ReactNode;
  hideGptBar?: boolean;
  children: React.ReactNode;
}) {
  const id = ctx.engagement.id;
  const base = `/e/${id}`;
  const [{ caseMenu }, needsYou] = await Promise.all([getPrefs(), needsYouCount(ctx.db, ctx.user.id)]);
  const badge = needsYou > 0 && <span className="nav-badge">{needsYou > 99 ? "99+" : needsYou}</span>;
  const full = caseMenu === "full" || (caseMenu === "auto" && section === "overview");
  const items = sections(ctx.gpt);
  return (
    <div className="shell">
      <Shortcuts engagementId={id} />
      <Suspense>
        <HashFocus />
      </Suspense>
      {full && (
        <nav className="nav" aria-label="Case sections">
          <Link href="/" className="brand" style={{ padding: 0 }}>
            Merqado
          </Link>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Link href="/" style={{ fontSize: 13 }}>
              ← All cases
            </Link>
            <Link href="/inbox" className="nav-item">
              <Icon name="inbox" />
              Needs you
              {badge}
            </Link>
            <div className="case-name">{ctx.engagement.clientName}</div>
            <div className="eyebrow" style={{ textTransform: "none", letterSpacing: 0 }}>
              {ctx.engagement.title}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {items.map((s) => (
              <Link key={s.key} href={base + s.href} className="nav-item" aria-current={s.key === section ? "page" : undefined}>
                <Icon name={s.icon} />
                {s.label}
              </Link>
            ))}
          </div>
          <div className="nav-foot">
            <Link href={`${base}/search`} className="nav-search">
              <Icon name="search" size={16} />
              <span style={{ flex: 1 }}>Keyword search</span>
              <kbd>Ctrl K</kbd>
            </Link>
            <NavUser />
          </div>
        </nav>
      )}
      {/* On a phone the full menu would fill the first screen, so the icon bar always shows there. */}
      <nav className={full ? "rail rail-phone" : "rail"} aria-label="Case sections">
        <Link href={base} className="rail-brand" aria-label={`${ctx.engagement.clientName} overview`} title={ctx.engagement.clientName}>
          m
        </Link>
        <Link href="/inbox" aria-label="Needs you" title="Needs you" className="rail-inbox">
          <Icon name="inbox" size={20} />
          {badge}
        </Link>
        {items.map((s) => (
          <Link key={s.key} href={base + s.href} aria-label={s.label} title={s.label} aria-current={s.key === section ? "page" : undefined}>
            <Icon name={s.icon} size={20} />
          </Link>
        ))}
        <div className="rail-foot">
          <Link href={`${base}/search`} aria-label="Keyword search" title="Keyword search · Ctrl K" className="rail-search" aria-current={section === "search" ? "page" : undefined}>
            <Icon name="search" />
          </Link>
          <NavUser compact />
        </div>
      </nav>
      <main className="main case-main">
        {title && (
          <header className="case-head">
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div className="muted" style={{ fontSize: 12 }}>
                {ctx.engagement.clientName} · {ctx.engagement.title}
              </div>
              <h1 style={{ fontSize: 28 }}>{title}</h1>
            </div>
            {actions && <div className="toolbar">{actions}</div>}
          </header>
        )}
        {children}
        {!hideGptBar && <GptBar engagementId={id} name={ctx.gpt} />}
      </main>
    </div>
  );
}
