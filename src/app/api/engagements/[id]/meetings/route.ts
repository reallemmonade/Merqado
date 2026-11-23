import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { engagements, meetings, meetingSync } from "@/db/schema";
import { notFoundJson, ok, parseOp } from "@/lib/case/api";
import { aiError, authorize, badRequest } from "@/lib/experts/api";
import { extractText } from "@/lib/files/extract";
import { GraphError } from "@/lib/meetings/graph";
import { attachTranscript, draftTakeaways, pullTranscript, syncPerson } from "@/lib/meetings/sync";
import { vttToText } from "@/lib/meetings/vtt";

const ref = z.string().min(1).max(64);
const Op = z.discriminatedUnion("op", [
  z.object({ op: z.literal("sync") }),
  z.object({ op: z.literal("add"), id: ref }),
  z.object({ op: z.literal("skip"), id: ref }),
  z.object({ op: z.literal("auto"), on: z.boolean() }),
  z.object({ op: z.literal("transcript"), id: ref }),
  z.object({ op: z.literal("takeaways"), id: ref }),
]);

const MAX_UPLOAD = 10 * 1024 * 1024;

/** Sync, add or skip found meetings, the Auto switch, and transcripts. A form upload attaches a transcript file. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (req.headers.get("content-type")?.includes("multipart/form-data")) return upload(req, id);

  const r = await parseOp(req, id, "upload", Op);
  if (r instanceof NextResponse) return r;
  const { auth, op } = r;
  const { db, user } = auth;
  const engagement = (await db.query.engagements.findFirst({ where: eq(engagements.id, id) }))!;

  if (op.op === "sync") {
    try {
      const res = await syncPerson(db, user.id, { onlyCases: [id] });
      if (!res.linked) return NextResponse.json({ error: "Connect Microsoft first.", connect: true }, { status: 409 });
      return ok({ found: res.found });
    } catch (e) {
      console.error("meeting sync failed", e);
      return NextResponse.json({ error: e instanceof GraphError ? e.message : "Microsoft could not be reached." }, { status: 502 });
    }
  }
  if (op.op === "auto") {
    await db.insert(meetingSync).values({ engagementId: id, auto: op.on }).onConflictDoUpdate({ target: meetingSync.engagementId, set: { auto: op.on } });
    return ok();
  }

  const meeting = await db.query.meetings.findFirst({ where: and(eq(meetings.id, op.id), eq(meetings.engagementId, id)) });
  if (!meeting) return notFoundJson();

  if (op.op === "skip") {
    await db.update(meetings).set({ status: "skipped" }).where(eq(meetings.id, meeting.id));
    return ok();
  }
  if (op.op === "add") {
    if (meeting.status === "added") return ok();
    await db.update(meetings).set({ status: "added", addedBy: user.id }).where(eq(meetings.id, meeting.id));
    const added = { ...meeting, status: "added" as const, addedBy: user.id };
    const status = await pullTranscript(db, added, engagement).catch((e) => {
      console.warn("transcript fetch failed", meeting.id, e instanceof Error ? e.message : e);
      return "waiting" as const;
    });
    return ok({ transcript: status });
  }
  if (op.op === "transcript") {
    return ok({ transcript: await pullTranscript(db, meeting, engagement).catch(() => meeting.transcriptStatus) });
  }
  // Redraft takeaways from the saved transcript.
  if (!meeting.transcriptSourceId) return badRequest("No transcript yet.");
  const src = await db.query.sources.findFirst({ where: (s, { eq: e }) => e(s.id, meeting.transcriptSourceId!) });
  if (!src?.textBody) return badRequest("No transcript yet.");
  try {
    return ok({ takeaways: await draftTakeaways(db, meeting, engagement, src.textBody, user.id) });
  } catch (e) {
    return aiError(e);
  }
}

/** Attaches a transcript file (Word, text or captions) to a meeting, e.g. a Zoom call from Outlook. */
async function upload(req: Request, id: string) {
  const auth = await authorize(id, "upload");
  if (auth instanceof NextResponse) return auth;
  const { db, user } = auth;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const meetingId = String(form?.get("id") ?? "");
  if (!(file instanceof File) || !file.size) return badRequest("Pick a file.");
  if (file.size > MAX_UPLOAD) return badRequest("Files up to 10 MB.");
  const meeting = await db.query.meetings.findFirst({ where: and(eq(meetings.id, meetingId), eq(meetings.engagementId, id), eq(meetings.status, "added")) });
  if (!meeting) return notFoundJson();
  const engagement = (await db.query.engagements.findFirst({ where: eq(engagements.id, id) }))!;
  const raw = await extractText(file.name, new Uint8Array(await file.arrayBuffer()));
  const text = /\.vtt$/i.test(file.name) || raw.startsWith("WEBVTT") ? vttToText(raw) : raw;
  if (!text.trim()) return badRequest("No text found in that file.");
  await attachTranscript(db, meeting, engagement, text, user.id);
  return ok();
}
