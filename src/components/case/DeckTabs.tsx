"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function DeckTabs({ engagementId, qc, contradictions }: { engagementId: string; qc: number; contradictions: number }) {
  const path = usePathname();
  const base = `/e/${engagementId}/deck`;
  const tabs = [
    { href: "", label: "Slides", n: 0 },
    { href: "/qc", label: "Quality check", n: qc },
    { href: "/contradictions", label: "Contradictions", n: contradictions },
  ];
  return (
    <nav className="subtabs" aria-label="Deck sections">
      {tabs.map((t) => (
        <Link key={t.label} href={base + t.href} aria-current={path === base + t.href ? "page" : undefined}>
          {t.label}
          {t.n > 0 && <span className="count">{t.n}</span>}
        </Link>
      ))}
    </nav>
  );
}
