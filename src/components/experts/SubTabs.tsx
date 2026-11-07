"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "", label: "Pipeline" },
  { href: "/metrics", label: "Metrics" },
  { href: "/ktas", label: "KTAs" },
  { href: "/transcripts", label: "Transcripts" },
  { href: "/guides", label: "Guides" },
  { href: "/setup", label: "Case setup" },
];

export function SubTabs({ engagementId }: { engagementId: string }) {
  const path = usePathname();
  const base = `/e/${engagementId}/experts`;
  return (
    <nav className="subtabs" aria-label="Experts sections">
      {TABS.map((t) => (
        <Link key={t.label} href={base + t.href} aria-current={path === base + t.href ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
      <span className="muted" style={{ padding: "10px 0" }} title="Coming later">
        Wish list
      </span>
    </nav>
  );
}
