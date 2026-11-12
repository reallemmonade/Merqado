import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { engagementMembers, engagements } from "@/db/schema";
import { AppNav } from "@/components/AppNav";
import { NeedsYouList, type NeedsYouGroup } from "@/components/NeedsYou";
import { flagLabel } from "@/lib/inbox/flags";
import { age, rowText, webLink } from "@/lib/inbox/present";
import { inboxCounts } from "@/lib/inbox/status";
import { readInbox, syncNotifications, type InboxView } from "@/lib/notifications/sync";
import { getSessionUser } from "@/lib/session";
import { DEFAULT_TIME_ZONE, isValidTimeZone } from "@/lib/cron/time-zone";

export const dynamic = "force-dynamic";

const VIEWS: { key: InboxView; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "snoozed", label: "Snoozed" },
  { key: "done", label: "Done" },
];

export default async function NeedsYouPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const db = getDb();
  const user = await getSessionUser(db);
  if (!user) redirect("/login?returnTo=/inbox");
  const sp = await searchParams;
  const view: InboxView = sp.view === "snoozed" || sp.view === "done" ? sp.view : "open";
  const now = new Date();

  const cases = await syncNotifications(db, user, now);
  const [items, counts, rows] = await Promise.all([
    readInbox(db, user, cases, now, 200, view),
    inboxCounts(db, user.id, now),
    db
      .select({ id: engagements.id, clientName: engagements.clientName, title: engagements.title })
      .from(engagements)
      .innerJoin(engagementMembers, eq(engagementMembers.engagementId, engagements.id))
      .where(eq(engagementMembers.userId, user.id))
      .orderBy(desc(engagements.createdAt)),
  ]);

  const zone = isValidTimeZone(user.timeZone) ? user.timeZone : DEFAULT_TIME_ZONE;
  const wake = new Intl.DateTimeFormat("en-GB", { timeZone: zone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const caseName = new Map(rows.map((r) => [r.id, `${r.clientName} · ${r.title}`]));
  const groups: NeedsYouGroup[] = [];
  const byCase = new Map<string, NeedsYouGroup>();
  for (const it of items) {
    let g = byCase.get(it.caseId);
    if (!g) {
      g = { caseId: it.caseId, name: caseName.get(it.caseId) ?? it.caseName, items: [] };
      byCase.set(it.caseId, g);
      groups.push(g);
    }
    g.items.push({
      key: it.id,
      kind: it.kind,
      unread: it.status === "unread",
      ...rowText(it),
      when: view === "snoozed" && it.snoozeUntil ? wake.format(new Date(it.snoozeUntil)) : age(it.at, now),
      href: webLink(it),
      canReopen: view !== "done" || it.doneBy === "user",
      ...(it.flag && it.days !== undefined && view === "open" ? { flag: it.flag, flagText: flagLabel({ flag: it.flag, days: it.days }) } : {}),
    });
  }

  return (
    <div className="shell">
      <AppNav engagements={rows} page="inbox" needsYou={counts.open} />
      <main className="main">
        <header className="inbox-head">
          <h1 style={{ fontSize: 28 }}>Needs you</h1>
          <nav className="seg" aria-label="View">
            {VIEWS.map((v) => (
              <Link key={v.key} href={v.key === "open" ? "/inbox" : `/inbox?view=${v.key}`} aria-current={v.key === view ? "page" : undefined}>
                {v.label}
                {v.key !== "done" && counts[v.key] > 0 ? ` ${counts[v.key]}` : ""}
              </Link>
            ))}
          </nav>
        </header>
        <NeedsYouList groups={groups} view={view} />
      </main>
    </div>
  );
}
