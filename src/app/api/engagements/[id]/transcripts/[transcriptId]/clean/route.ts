import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { experts, expertTopics, expertTranscripts } from "@/db/schema";
import { completeAndMeter, resolveProvider } from "@/lib/ai";
import { aiError, authorize } from "@/lib/experts/api";
import { cleanTranscriptWithAI } from "@/lib/experts/clean";

/** Runs the AI cleaner on one transcript. The verbatim upload is always kept alongside. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string; transcriptId: string }> }) {
  const { id, transcriptId } = await params;
  const auth = await authorize(id, "upload");
  if (auth instanceof NextResponse) return auth;
  const { db, user, engagement } = auth;
  const tr = await db.query.expertTranscripts.findFirst({
    where: and(eq(expertTranscripts.id, transcriptId), eq(expertTranscripts.engagementId, id)),
  });
  if (!tr) return NextResponse.json({ error: "Transcript not found." }, { status: 404 });

  const [people, topics] = await Promise.all([
    db.select({ company: experts.company, first: experts.firstName, last: experts.lastName, id: experts.id }).from(experts).where(eq(experts.engagementId, id)),
    db.select({ name: expertTopics.name }).from(expertTopics).where(eq(expertTopics.engagementId, id)),
  ]);
  const me = people.find((p) => p.id === tr.expertId);
  const glossary = [
    `Client: ${engagement.clientName}`,
    `Case: ${engagement.title}`,
    ...(me ? [`The expert on this call is ${[me.first, me.last].join(" ").trim()} (refer to them as "Expert")`] : []),
    ...[...new Set(people.map((p) => p.company).filter(Boolean))].map((c) => `Company: ${c}`),
    ...topics.map((t) => `Topic: ${t.name}`),
  ];

  await db.update(expertTranscripts).set({ cleanStatus: "cleaning" }).where(eq(expertTranscripts.id, tr.id));
  try {
    const resolved = await resolveProvider(db, user.firmId, engagement.aiProviderId);
    const res = await cleanTranscriptWithAI(tr.body, glossary, (req) =>
      completeAndMeter(db, resolved, req, { firmId: user.firmId, engagementId: id, userId: user.id, feature: "transcript_clean" }),
    );
    await db
      .update(expertTranscripts)
      .set({ cleanedBody: res.text, cleanFlags: JSON.stringify(res.flags), cleanStatus: "cleaned" })
      .where(eq(expertTranscripts.id, tr.id));
    return NextResponse.json({ flags: res.flags.length, keptVerbatim: res.keptVerbatim });
  } catch (err) {
    await db.update(expertTranscripts).set({ cleanStatus: "failed" }).where(eq(expertTranscripts.id, tr.id));
    return aiError(err);
  }
}
