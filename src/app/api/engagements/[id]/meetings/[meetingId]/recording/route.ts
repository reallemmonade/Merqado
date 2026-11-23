import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { meetings } from "@/db/schema";
import { authorize } from "@/lib/experts/api";
import { recordingStream } from "@/lib/meetings/graph";
import { graphAccess } from "@/lib/meetings/link";

/** Streams an added meeting's Teams recording to anyone on the case. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; meetingId: string }> }) {
  const { id, meetingId } = await params;
  const auth = await authorize(id, "read");
  if (auth instanceof NextResponse) return auth;
  const m = await auth.db.query.meetings.findFirst({ where: and(eq(meetings.id, meetingId), eq(meetings.engagementId, id), eq(meetings.status, "added")) });
  if (!m?.recordingId || !m.onlineMeetingId || !m.recordingVia) return NextResponse.json({ error: "No recording." }, { status: 404 });
  const access = await graphAccess(auth.db, m.recordingVia);
  if (!access) return NextResponse.json({ error: "Recording unavailable." }, { status: 409 });
  try {
    const res = await recordingStream(access.token, m.onlineMeetingId, m.recordingId);
    return new Response(res.body, {
      headers: {
        "content-type": res.headers.get("content-type") ?? "video/mp4",
        ...(res.headers.get("content-length") && { "content-length": res.headers.get("content-length")! }),
        "cache-control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Recording unavailable." }, { status: 502 });
  }
}
