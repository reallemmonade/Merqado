import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { experts, expertTopics, expertTypes, findings, hypotheses, keyTakeaways, runningGuides } from "@/db/schema";
import { completeAndMeter, resolveProvider } from "@/lib/ai";
import { aiError, authorize, extractJson } from "@/lib/experts/api";
import { anonymizeTitle, parseIdList } from "@/lib/experts/calc";
import { findExpert } from "@/lib/experts/data";

const reply = z.object({
  bespoke: z.array(z.object({ question: z.string(), tests: z.string().optional().default("") })).max(15),
});

/**
 * Drafts an interview guide for one expert: bespoke questions aimed at the hypotheses and
 * storyline (the running deck), followed by the team's running guide for that interviewee type.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string; expertId: string }> }) {
  const { id, expertId } = await params;
  const auth = await authorize(id, "edit_experts");
  if (auth instanceof NextResponse) return auth;
  const { db, user, engagement } = auth;
  const expert = await findExpert(db, id, expertId);
  if (!expert) return NextResponse.json({ error: "Expert not found." }, { status: 404 });

  const [type, topics, hyps, storyline, covered, typeGuide, generalGuide] = await Promise.all([
    expert.typeId ? db.query.expertTypes.findFirst({ where: eq(expertTypes.id, expert.typeId) }) : undefined,
    db.select().from(expertTopics).where(eq(expertTopics.engagementId, id)),
    db.select().from(hypotheses).where(eq(hypotheses.engagementId, id)),
    db.select().from(findings).where(eq(findings.engagementId, id)).limit(60),
    db.select().from(keyTakeaways).where(and(eq(keyTakeaways.engagementId, id), eq(keyTakeaways.included, true))).limit(80),
    expert.typeId
      ? db.query.runningGuides.findFirst({ where: and(eq(runningGuides.engagementId, id), eq(runningGuides.typeId, expert.typeId)) })
      : undefined,
    db.query.runningGuides.findFirst({ where: and(eq(runningGuides.engagementId, id), isNull(runningGuides.typeId)) }),
  ]);
  const running = (typeGuide?.body || generalGuide?.body || "").trim();
  const myTopics = topics.filter((t) => parseIdList(expert.topicIds).includes(t.id)).map((t) => t.name);

  const context = [
    `Engagement: ${engagement.clientName} — ${engagement.title}`,
    `Interviewee: ${anonymizeTitle(expert.company, expert.title, expert.isFormer)} (full title: ${expert.title || "unknown"}; company: ${expert.company || "unknown"})`,
    `Interviewee type: ${type?.name ?? "not set"}`,
    `Their areas of expertise: ${myTopics.join(", ") || "not tagged"}`,
    `Call length: ${expert.callMinutes || 60} minutes`,
    "",
    "Hypotheses / deck slides being tested:",
    ...(hyps.length ? hyps.map((h) => `- ${h.slideRef ? h.slideRef + ": " : ""}${h.statement}`) : ["- (none yet)"]),
    "",
    "Storyline findings so far:",
    ...(storyline.length ? storyline.map((f) => `- [${f.status}] ${f.statement}`) : ["- (none yet)"]),
    "",
    "Already learned from earlier interviews (don't re-ask these):",
    ...(covered.length ? covered.map((k) => `- ${k.body}`) : ["- (nothing yet)"]),
    "",
    "Running interview guide the team already uses (don't repeat its questions):",
    running || "(none yet)",
  ].join("\n");

  try {
    const resolved = await resolveProvider(db, user.firmId, engagement.aiProviderId);
    const result = await completeAndMeter(
      db,
      resolved,
      {
        system:
          "You write expert-network interview guides for a management consulting team. " +
          "Write 4 to 8 bespoke questions for this specific interviewee that test the hypotheses and storyline, " +
          "fit what this person can credibly know from their role, and fill gaps not already covered. " +
          "Never ask for confidential information about their current or former employer. " +
          'Reply with JSON only: {"bespoke":[{"question":"...","tests":"Slide 4: short hypothesis name"}]}. ' +
          'Use "tests" to name the hypothesis or slide each question checks, or "" if none.',
        messages: [{ role: "user", content: context }],
        maxTokens: 2000,
      },
      { firmId: user.firmId, engagementId: id, userId: user.id, feature: "expert_guide" },
    );
    if (result.refused) return NextResponse.json({ error: "The model declined to write this guide." }, { status: 422 });
    const { bespoke } = reply.parse(extractJson(result.text));

    const guide = [
      `## Bespoke questions for ${expert.firstName}`,
      ...bespoke.map((q, i) => `${i + 1}. ${q.question}${q.tests ? ` _(tests ${q.tests})_` : ""}`),
      "",
      "## Running guide",
      running || "_No running guide yet. Add one under Guides._",
    ].join("\n");
    await db.update(experts).set({ guide, guideUpdatedAt: new Date() }).where(eq(experts.id, expertId));
    return NextResponse.json({ guide });
  } catch (err) {
    return aiError(err);
  }
}
