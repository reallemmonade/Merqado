import { mkdtempSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import type { DB } from "@/db/client";
import { encryptJson } from "@/lib/crypto";
import { pullTranscript, runMeetingSync, syncPerson, transcriptFilename } from "./sync";

process.env.MERQADO_SECRET_KEY = randomBytes(32).toString("base64");
process.env.MICROSOFT_CLIENT_ID = "client";
process.env.MICROSOFT_CLIENT_SECRET = "secret";

const NOW = new Date("2026-11-23T12:00:00Z");
const JOIN = "https://teams.microsoft.com/l/meetup-join/abc";

/** A fake Microsoft: token, calendar, meeting lookup, transcript and recording. */
function fakeGraph(opts: { transcript?: string | null } = {}) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const url = String(input);
    calls.push(url);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (url.includes("/oauth2/v2.0/token")) return json({ access_token: "at", refresh_token: "rt2" });
    if (url.includes("/me/calendarView"))
      return json({
        value: [
          {
            id: "1",
            iCalUId: "ev-steerco",
            subject: "Company 07 CASE001 steerco",
            start: { dateTime: "2026-11-23T10:00:00.0000000" },
            end: { dateTime: "2026-11-23T10:58:00.0000000" },
            organizer: { emailAddress: { address: "p01@firm.test" } },
            attendees: [],
            onlineMeetingProvider: "teamsForBusiness",
            onlineMeeting: { joinUrl: JOIN },
          },
          {
            id: "2",
            iCalUId: "ev-dentist",
            subject: "Dentist",
            start: { dateTime: "2026-11-22T10:00:00" },
            end: { dateTime: "2026-11-22T11:00:00" },
            attendees: [],
          },
        ],
      });
    if (url.includes("/me/onlineMeetings?$filter")) return json({ value: [{ id: "om1" }] });
    if (url.includes("/transcripts/t1/content")) return new Response(opts.transcript ?? "", { status: 200 });
    if (url.endsWith("/transcripts")) return json({ value: opts.transcript ? [{ id: "t1", createdDateTime: "2026-11-23T11:00:00Z" }] : [] });
    if (url.endsWith("/recordings")) return json({ value: [{ id: "r1" }] });
    return json({ error: { message: "nope" } }, 404);
  });
  return calls;
}

describe("meeting sync", () => {
  let db: DB;
  let caseId: string;
  let userId: string;

  beforeEach(async () => {
    const dir = mkdtempSync(join(tmpdir(), "mq-meet-"));
    db = drizzle(createClient({ url: `file:${join(dir, "t.db")}` }), { schema });
    await migrate(db, { migrationsFolder: "./drizzle" });
    const [firm] = await db.insert(schema.firms).values({ name: "Firm", slug: "firm" }).returning();
    const [user] = await db.insert(schema.users).values({ email: "p01@firm.test", name: "Person 01" }).returning();
    userId = user!.id;
    const [eng] = await db.insert(schema.engagements).values({ firmId: firm!.id, clientName: "Company 07", title: "Project Atlas" }).returning();
    caseId = eng!.id;
    await db.insert(schema.engagementMembers).values({ engagementId: caseId, userId });
    await db.insert(schema.caseOnboarding).values({ engagementId: caseId, caseCode: "CASE001" });
    await db.insert(schema.microsoftLinks).values({ userId, firmId: firm!.id, account: "p01@firm.test", tenantId: "t", encryptedToken: encryptJson({ refreshToken: "rt", full: true }), transcripts: true });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("lists matched meetings to confirm, once, with the client's name removed", async () => {
    fakeGraph();
    expect(await syncPerson(db, userId, { now: NOW })).toEqual({ found: 1, linked: true });
    expect(await syncPerson(db, userId, { now: NOW })).toEqual({ found: 0, linked: true });
    const rows = await db.select().from(schema.meetings);
    expect(rows.map((r) => [r.title, r.status, r.source, r.matchedBy, r.minutes])).toEqual([["Client CASE001 steerco", "pending", "teams", "Case code in title", 58]]);
  });

  it("skips cases with Auto off on the schedule", async () => {
    fakeGraph();
    await db.insert(schema.meetingSync).values({ engagementId: caseId, auto: false });
    expect(await runMeetingSync(db, NOW)).toMatchObject({ people: 1, found: 0 });
  });

  it("saves the transcript to Files once the meeting is added", async () => {
    fakeGraph({ transcript: "WEBVTT\n\n00:00:04.000 --> 00:00:06.000\n<v Person 40>Lead times, mostly.</v>" });
    await syncPerson(db, userId, { now: NOW });
    const [m] = await db.select().from(schema.meetings);
    await db.update(schema.meetings).set({ status: "added" }).where(eq(schema.meetings.id, m!.id));
    const eng = (await db.query.engagements.findFirst({ where: eq(schema.engagements.id, caseId) }))!;
    expect(await pullTranscript(db, { ...m!, status: "added" }, eng, NOW)).toBe("ready");
    const [after] = await db.select().from(schema.meetings);
    expect(after!.recordingId).toBe("r1");
    const file = await db.query.sources.findFirst({ where: eq(schema.sources.id, after!.transcriptSourceId!) });
    expect([file!.filename, file!.folder, file!.filing, file!.textBody]).toEqual(["2026-11-23 Client CASE001 steerco.txt", "Meetings/Transcripts", "filed", "Person 40 00:04 Lead times, mostly."]);
  });

  it("waits for a transcript Teams hasn't posted yet", async () => {
    fakeGraph({ transcript: null });
    await syncPerson(db, userId, { now: NOW });
    const [m] = await db.select().from(schema.meetings);
    const eng = (await db.query.engagements.findFirst({ where: eq(schema.engagements.id, caseId) }))!;
    expect(await pullTranscript(db, m!, eng, NOW)).toBe("waiting");
    expect(await pullTranscript(db, m!, eng, new Date("2026-11-26T12:00:00Z"))).toBe("unavailable");
  });
});

describe("transcriptFilename", () => {
  it("dates the file and strips path characters", () => {
    expect(transcriptFilename({ title: "Mgmt 1:1 / Person 12", startAt: new Date("2026-11-22T15:30:00Z") })).toBe("2026-11-22 Mgmt 1 1 Person 12.txt");
  });
});
