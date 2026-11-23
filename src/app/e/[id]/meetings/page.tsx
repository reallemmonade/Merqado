import { and, desc, eq, inArray } from "drizzle-orm";
import { CaseShell } from "@/components/case/CaseShell";
import { Meetings, type MeetingRow } from "@/components/case/Meetings";
import { meetings, meetingSync, microsoftLinks, sources } from "@/db/schema";
import { appBaseUrl } from "@/lib/auth/url";
import { loadCase } from "@/lib/case/page";
import { adminConsentUrl } from "@/lib/meetings/link";
import { platformCredentials } from "@/lib/auth/platform";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function MeetingsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ m?: string; ms?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await loadCase(id, "/meetings");
  const { db, user } = ctx;
  const [rows, sync, link] = await Promise.all([
    db
      .select()
      .from(meetings)
      .where(and(eq(meetings.engagementId, id), inArray(meetings.status, ["pending", "added"])))
      .orderBy(desc(meetings.startAt))
      .limit(300),
    db.query.meetingSync.findFirst({ where: eq(meetingSync.engagementId, id) }),
    db.query.microsoftLinks.findFirst({ where: eq(microsoftLinks.userId, user.id) }),
  ]);

  const added = rows.filter((r) => r.status === "added");
  const selected = added.find((r) => r.id === sp.m) ?? added[0] ?? null;
  const transcript = selected?.transcriptSourceId
    ? await db.query.sources.findFirst({ where: eq(sources.id, selected.transcriptSourceId), columns: { id: true, filename: true, folder: true, textBody: true } })
    : null;

  const tz = user.timeZone ?? "UTC";
  const when = (d: Date) =>
    `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz })} · ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz })}`;
  const toRow = (m: (typeof rows)[number]): MeetingRow => ({
    id: m.id,
    title: m.title,
    when: when(m.startAt),
    minutes: m.minutes,
    source: m.source === "teams" ? "Teams" : "Outlook",
    matchedBy: m.matchedBy,
    transcript: m.transcriptStatus,
    recording: !!m.recordingId,
    takeaways: JSON.parse(m.takeaways) as string[],
  });

  const h = await headers();
  const base = appBaseUrl(new Request(`${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "localhost"}/`));
  const microsoftReady = !!platformCredentials("microsoft");

  return (
    <CaseShell ctx={ctx} section="meetings" title="Meetings">
      <Meetings
        engagementId={id}
        pending={rows.filter((r) => r.status === "pending").map(toRow)}
        added={added.map(toRow)}
        selected={selected ? toRow(selected) : null}
        transcript={transcript ? { id: transcript.id, filename: transcript.filename, folder: transcript.folder, text: transcript.textBody ?? "" } : null}
        auto={sync?.auto ?? true}
        link={link ? { account: link.account, transcripts: link.transcripts, broken: !!link.lastError } : null}
        notice={sp.ms ?? null}
        itLink={microsoftReady ? adminConsentUrl(base) : null}
      />
    </CaseShell>
  );
}
