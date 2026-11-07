import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { expertTopics, expertTranscripts, hypotheses, keyTakeaways } from "@/db/schema";
import { completeAndMeter, resolveProvider } from "@/lib/ai";
import { aiError, authorize, badRequest, extractJson } from "@/lib/experts/api";
import { anonymizeTitle } from "@/lib/experts/calc";
import { findExpert } from "@/lib/experts/data";
import { takeawayFields } from "@/lib/experts/schemas";

/** Max transcript characters sent to the model per call (long calls are cut, not dropped). */
/** About 75k tokens: a few hours of calls. Longer text is cut, and the reply says so. */
const MAX_CHARS = 300_000;

const reply = z.object({
  takeaways: z
    .array(
      z.object({
        body: z.string(),
        verdict: z.enum(["supports", "challenges", "new"]).catch("new"),
        hypothesis: z.number().int().nullable().optional(),
        locator: z.string().optional().default(""),
      }),
    )
    .max(20),
  topics: z.array(z.number().int()).optional().default([]),
});

/** Adds one takeaway by hand (JSON body), or, with ?generate=1, drafts them from the transcripts. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; expertId: string }> }) {
  const { id, expertId } = await params;
  const auth = await authorize(id, "edit_experts");
  if (auth instanceof NextResponse) return auth;
  const { db, user, engagement } = auth;
  const expert = await findExpert(db, id, expertId);
  if (!expert) return NextResponse.json({ error: "Expert not found." }, { status: 404 });

  if (new URL(req.url).searchParams.get("generate") !== "1") {
    const parsed = takeawayFields.partial({ verdict: true, hypothesisId: true, locator: true, included: true }).safeParse(
      await req.json().catch(() => null),
    );
    if (!parsed.success) return badRequest("Write the takeaway first.");
    const [row] = await db
      .insert(keyTakeaways)
      .values({ ...parsed.data, expertId, engagementId: id, source: "manual" })
      .returning({ id: keyTakeaways.id });
    return NextResponse.json({ id: row!.id });
  }

  const [transcripts, hyps, topics] = await Promise.all([
    db.select().from(expertTranscripts).where(eq(expertTranscripts.expertId, expertId)),
    db.select().from(hypotheses).where(eq(hypotheses.engagementId, id)),
    db.select().from(expertTopics).where(eq(expertTopics.engagementId, id)),
  ]);
  if (!transcripts.length) return badRequest("Upload a transcript for this expert first.");

  let budget = MAX_CHARS;
  const fullLength = transcripts.reduce((n, t) => n + (t.cleanedBody ?? t.body).length, 0);
  const text = transcripts
    .map((t) => {
      const chunk = (t.cleanedBody ?? t.body).slice(0, Math.max(0, budget));
      budget -= chunk.length;
      return `=== ${t.kind === "call" ? "Main call" : "Follow-up"}: ${t.filename} ===\n${chunk}`;
    })
    .join("\n\n");

  const context = [
    `Engagement: ${engagement.clientName} — ${engagement.title}`,
    `Interviewee: ${anonymizeTitle(expert.company, expert.title, expert.isFormer)}`,
    "",
    "Hypotheses (refer to them by number):",
    ...(hyps.length ? hyps.map((h, i) => `${i + 1}. ${h.slideRef ? h.slideRef + ": " : ""}${h.statement}`) : ["(none yet)"]),
    "",
    "Case topics (refer to them by number):",
    ...(topics.length ? topics.map((t, i) => `${i + 1}. ${t.name}`) : ["(none yet)"]),
    "",
    "Transcript:",
    text,
  ].join("\n");

  try {
    const resolved = await resolveProvider(db, user.firmId, engagement.aiProviderId);
    const result = await completeAndMeter(
      db,
      resolved,
      {
        system:
          "You write key takeaways (KTAs) from expert interview transcripts for a management consulting team. " +
          "Write 3 to 8 takeaways. Each is one or two plain sentences stating what the expert said, with numbers where given. " +
          "Mark each as supporting or challenging a numbered hypothesis, or as a new point. " +
          "Give the transcript timestamp or speaker turn it comes from as locator when one is visible. " +
          "Also list the numbers of the case topics the call genuinely discussed (more than a passing mention). " +
          'Reply with JSON only: {"takeaways":[{"body":"...","verdict":"supports|challenges|new","hypothesis":1,"locator":"06:40"}],"topics":[1,3]}. ' +
          'Use "hypothesis": null for new points.',
        messages: [{ role: "user", content: context }],
        maxTokens: 3000,
      },
      { firmId: user.firmId, engagementId: id, userId: user.id, feature: "expert_takeaways" },
    );
    if (result.refused) return NextResponse.json({ error: "The model declined to summarize this transcript." }, { status: 422 });
    const parsed = reply.parse(extractJson(result.text));

    // Regenerating replaces earlier AI drafts for this expert; hand-written ones stay.
    await db.delete(keyTakeaways).where(and(eq(keyTakeaways.expertId, expertId), eq(keyTakeaways.source, "ai")));
    if (parsed.takeaways.length) {
      await db.insert(keyTakeaways).values(
        parsed.takeaways.map((k, i) => ({
          expertId,
          engagementId: id,
          body: k.body,
          verdict: k.verdict,
          hypothesisId: k.hypothesis && hyps[k.hypothesis - 1] ? hyps[k.hypothesis - 1]!.id : null,
          locator: k.locator.slice(0, 40),
          source: "ai" as const,
          sort: i,
        })),
      );
    }
    const discussed = parsed.topics.map((n) => topics[n - 1]?.id).filter((x): x is string => !!x);
    for (const t of transcripts) {
      await db.update(expertTranscripts).set({ discussedTopicIds: JSON.stringify(discussed) }).where(eq(expertTranscripts.id, t.id));
    }
    const note =
      fullLength > MAX_CHARS
        ? `These transcripts are very long, so the takeaways were drafted from the first ${Math.round((MAX_CHARS / fullLength) * 100)}% of the text. The full transcript is still saved.`
        : undefined;
    return NextResponse.json({ count: parsed.takeaways.length, note });
  } catch (err) {
    return aiError(err);
  }
}
