import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db/client";
import { caseOnboarding, engagementMembers, engagements, experts, meetings, meetingSync, microsoftLinks, users } from "@/db/schema";
import { completeAndMeter, resolveProvider } from "@/lib/ai";
import { extractJson } from "@/lib/experts/api";
import { anonymizeTitle } from "@/lib/experts/calc";
import { caseFolderName } from "@/lib/files/intake";
import { saveSourceFile } from "@/lib/storage/files";
import { findOnlineMeeting, GraphError, latestRecording, latestTranscript, listEvents, toMeeting } from "./graph";
import { graphAccess } from "./link";
import { cleanTitle, matchEvent, type CaseFacts } from "./match";
import { vttToText } from "./vtt";

/** How far back a sync looks. */
export const SYNC_DAYS = 14;
/** Teams posts transcripts a few minutes after a call; keep checking this long. */
const WAIT_HOURS = 48;
export const TRANSCRIPT_FOLDER = "Meetings/Transcripts";

type Engagement = typeof engagements.$inferSelect;
type Meeting = typeof meetings.$inferSelect;

/** What each case offers for matching: code, project name, team emails and experts. */
export async function caseFacts(db: DB, engagementIds: string[]): Promise<CaseFacts[]> {
  if (!engagementIds.length) return [];
  const [cases, codes, team, exps] = await Promise.all([
    db.select().from(engagements).where(inArray(engagements.id, engagementIds)),
    db.select({ id: caseOnboarding.engagementId, code: caseOnboarding.caseCode }).from(caseOnboarding).where(inArray(caseOnboarding.engagementId, engagementIds)),
    db
      .select({ id: engagementMembers.engagementId, email: users.email })
      .from(engagementMembers)
      .innerJoin(users, eq(users.id, engagementMembers.userId))
      .where(inArray(engagementMembers.engagementId, engagementIds)),
    db
      .select({ id: experts.engagementId, first: experts.firstName, last: experts.lastName, company: experts.company, title: experts.title, anon: experts.anonTitle, former: experts.isFormer })
      .from(experts)
      .where(inArray(experts.engagementId, engagementIds)),
  ]);
  return cases.map((c) => ({
    engagementId: c.id,
    caseCode: codes.find((x) => x.id === c.id)?.code ?? "",
    projectName: c.title,
    clientName: c.clientName,
    team: team.filter((t) => t.id === c.id).map((t) => t.email.toLowerCase()),
    experts: exps
      .filter((x) => x.id === c.id)
      .map((x) => ({ name: `${x.first} ${x.last}`.trim(), label: x.anon || anonymizeTitle(x.company, x.title, x.former) })),
  }));
}

/**
 * Reads one person's calendar and lists new meetings under the case each belongs to, waiting
 * for someone to add them. Only cases the person is on are considered.
 */
export async function syncPerson(db: DB, userId: string, opts: { now?: Date; onlyCases?: string[]; autoOnly?: boolean } = {}): Promise<{ found: number; linked: boolean }> {
  const now = opts.now ?? new Date();
  const access = await graphAccess(db, userId);
  if (!access) return { found: 0, linked: false };
  let caseIds = (
    await db
      .select({ id: engagements.id })
      .from(engagements)
      .innerJoin(engagementMembers, eq(engagementMembers.engagementId, engagements.id))
      .where(and(eq(engagementMembers.userId, userId), eq(engagements.status, "active")))
  ).map((r) => r.id);
  if (opts.onlyCases) caseIds = caseIds.filter((id) => opts.onlyCases!.includes(id));
  if (opts.autoOnly && caseIds.length) {
    const off = await db.select({ id: meetingSync.engagementId }).from(meetingSync).where(and(inArray(meetingSync.engagementId, caseIds), eq(meetingSync.auto, false)));
    caseIds = caseIds.filter((id) => !off.some((o) => o.id === id));
  }
  if (!caseIds.length) return { found: 0, linked: true };

  const facts = await caseFacts(db, caseIds);
  const events = await listEvents(access.token, new Date(now.getTime() - SYNC_DAYS * 864e5), now);
  let found = 0;
  for (const ev of events) {
    const m = toMeeting(ev, now);
    if (!m) continue;
    const match = matchEvent({ subject: m.subject, people: m.people }, facts);
    if (!match) continue;
    const c = facts.find((f) => f.engagementId === match.engagementId)!;
    const rows = await db
      .insert(meetings)
      .values({
        engagementId: match.engagementId,
        externalId: m.externalId,
        source: m.source,
        title: cleanTitle(m.subject, c),
        startAt: m.startAt,
        minutes: m.minutes,
        joinUrl: m.joinUrl,
        attendees: JSON.stringify(m.people),
        matchedBy: match.matchedBy,
        foundBy: userId,
      })
      .onConflictDoNothing()
      .returning({ id: meetings.id });
    found += rows.length;
  }
  for (const id of caseIds) {
    await db.insert(meetingSync).values({ engagementId: id, lastSyncAt: now }).onConflictDoUpdate({ target: meetingSync.engagementId, set: { lastSyncAt: now } });
  }
  return { found, linked: true };
}

/** People on the case who linked Microsoft, the one who found the meeting first. */
async function linkedPeople(db: DB, meeting: Meeting): Promise<string[]> {
  const rows = await db
    .select({ id: microsoftLinks.userId })
    .from(microsoftLinks)
    .innerJoin(engagementMembers, eq(engagementMembers.userId, microsoftLinks.userId))
    .where(and(eq(engagementMembers.engagementId, meeting.engagementId), eq(microsoftLinks.transcripts, true)));
  const ids = rows.map((r) => r.id);
  return meeting.foundBy && ids.includes(meeting.foundBy) ? [meeting.foundBy, ...ids.filter((i) => i !== meeting.foundBy)] : ids;
}

/**
 * Fetches a Teams meeting's transcript (and notes its recording) through anyone on the case
 * whose Microsoft link can see it. Saves the transcript to Files and drafts key takeaways.
 */
export async function pullTranscript(db: DB, meeting: Meeting, engagement: Engagement, now = new Date()): Promise<Meeting["transcriptStatus"]> {
  if (meeting.source !== "teams" || !meeting.joinUrl) {
    await db.update(meetings).set({ transcriptStatus: "unavailable", transcriptCheckedAt: now }).where(eq(meetings.id, meeting.id));
    return "unavailable";
  }
  for (const userId of await linkedPeople(db, meeting)) {
    const access = await graphAccess(db, userId);
    if (!access?.transcripts) continue;
    try {
      const onlineId = meeting.onlineMeetingId ?? (await findOnlineMeeting(access.token, meeting.joinUrl));
      if (!onlineId) continue;
      const [vtt, recordingId] = await Promise.all([latestTranscript(access.token, onlineId), latestRecording(access.token, onlineId).catch(() => null)]);
      await db
        .update(meetings)
        .set({ onlineMeetingId: onlineId, ...(recordingId && { recordingId, recordingVia: userId }), transcriptCheckedAt: now })
        .where(eq(meetings.id, meeting.id));
      if (vtt) {
        await attachTranscript(db, { ...meeting, onlineMeetingId: onlineId }, engagement, vttToText(vtt), userId);
        return "ready";
      }
      break;
    } catch (e) {
      if (!(e instanceof GraphError) || ![401, 403, 404].includes(e.status)) throw e;
    }
  }
  const fresh = now.getTime() - (meeting.startAt.getTime() + meeting.minutes * 60000) < WAIT_HOURS * 3600e3;
  const status = fresh ? "waiting" : "unavailable";
  await db.update(meetings).set({ transcriptStatus: status, transcriptCheckedAt: now }).where(eq(meetings.id, meeting.id));
  return status;
}

/** A safe file name for a meeting's transcript. */
export function transcriptFilename(meeting: Pick<Meeting, "title" | "startAt">): string {
  const day = meeting.startAt.toISOString().slice(0, 10);
  const title = meeting.title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  return `${day} ${title || "Meeting"}.txt`;
}

/** Saves transcript text to the case's Files and drafts key takeaways from it. */
export async function attachTranscript(db: DB, meeting: Meeting, engagement: Engagement, text: string, userId: string): Promise<void> {
  const body = text.trim();
  if (!body) return;
  const filename = transcriptFilename(meeting);
  const bytes = new TextEncoder().encode(body);
  const source = await saveSourceFile(db, {
    firmId: engagement.firmId,
    engagementId: engagement.id,
    storageConnectionId: engagement.storageConnectionId,
    file: new File([bytes], filename, { type: "text/plain" }),
    bytes,
    uploadedBy: userId,
    place: [caseFolderName(engagement), ...TRANSCRIPT_FOLDER.split("/")],
    values: { folder: TRANSCRIPT_FOLDER, filing: "filed", textBody: body },
  });
  await db.update(meetings).set({ transcriptStatus: "ready", transcriptSourceId: source.id }).where(eq(meetings.id, meeting.id));
  try {
    await draftTakeaways(db, meeting, engagement, body, userId);
  } catch (e) {
    console.warn("meeting takeaways failed", meeting.id, e instanceof Error ? e.message : e);
  }
}

const ktaReply = z.object({ takeaways: z.array(z.string()).max(10) });
const KTA_CHARS = 200_000;

/** 3 to 8 key takeaways from a meeting transcript. */
export async function draftTakeaways(db: DB, meeting: Pick<Meeting, "id" | "title">, engagement: Engagement, text: string, userId: string | null): Promise<string[]> {
  const resolved = await resolveProvider(db, engagement.firmId, engagement.aiProviderId);
  const result = await completeAndMeter(
    db,
    resolved,
    {
      system:
        "You write key takeaways (KTAs) from a consulting case meeting transcript: team meetings, management calls, client calls or expert calls. " +
        "Write 3 to 8 takeaways. Each is one or two plain sentences on a finding, decision or open question, with numbers where given. " +
        'Use the codes people are referred to by; never add a client\'s real name. Reply with JSON only: {"takeaways":["..."]}.',
      messages: [{ role: "user", content: `Meeting: ${meeting.title}\n\nTranscript:\n${text.slice(0, KTA_CHARS)}` }],
      maxTokens: 1500,
    },
    { firmId: engagement.firmId, engagementId: engagement.id, userId: userId ?? undefined, feature: "meeting_takeaways" },
  );
  if (result.refused) return [];
  const takeaways = ktaReply.parse(extractJson(result.text)).takeaways.map((t) => t.trim()).filter(Boolean).slice(0, 8);
  await db.update(meetings).set({ takeaways: JSON.stringify(takeaways) }).where(eq(meetings.id, meeting.id));
  return takeaways;
}

/** Scheduler: pulls each linked person's meetings for cases with Auto on, then retries waiting transcripts. */
export async function runMeetingSync(db: DB, now = new Date()) {
  const people = await db.select({ id: microsoftLinks.userId }).from(microsoftLinks);
  let found = 0;
  let failed = 0;
  for (const p of people) {
    try {
      found += (await syncPerson(db, p.id, { now, autoOnly: true })).found;
    } catch (e) {
      failed++;
      console.warn("meeting sync failed", p.id, e instanceof Error ? e.message : e);
    }
  }
  const waiting = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.status, "added"), eq(meetings.transcriptStatus, "waiting"), gte(meetings.startAt, new Date(now.getTime() - 3 * 864e5)), lt(meetings.startAt, now)))
    .limit(10);
  let transcripts = 0;
  for (const m of waiting) {
    const engagement = await db.query.engagements.findFirst({ where: eq(engagements.id, m.engagementId) });
    if (!engagement) continue;
    try {
      if ((await pullTranscript(db, m, engagement, now)) === "ready") transcripts++;
    } catch (e) {
      failed++;
      console.warn("meeting transcript failed", m.id, e instanceof Error ? e.message : e);
    }
  }
  return { people: people.length, found, transcripts, failed };
}
