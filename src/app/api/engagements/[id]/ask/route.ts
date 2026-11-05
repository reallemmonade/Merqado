import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { findings, sources } from "@/db/schema";
import { completeAndMeter, resolveProvider } from "@/lib/ai";
import { can } from "@/lib/roles";
import { getEngagementAccess, getSessionUser } from "@/lib/session";

const body = z.object({ question: z.string().trim().min(1).max(4000) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const user = await getSessionUser(db);
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  const membership = await getEngagementAccess(db, user, id);
  if (!membership || !can(membership.access, "ask")) {
    return NextResponse.json({ error: "You don't have access to this engagement." }, { status: 403 });
  }

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ask a question first." }, { status: 400 });

  const [recentFindings, recentSources] = await Promise.all([
    db.select().from(findings).where(eq(findings.engagementId, id)).orderBy(desc(findings.createdAt)).limit(50),
    db.select().from(sources).where(eq(sources.engagementId, id)).orderBy(desc(sources.createdAt)).limit(50),
  ]);

  // v0 context: findings and file names. Retrieval over source contents comes next.
  const context = [
    `Engagement: ${membership.engagement.clientName} — ${membership.engagement.title}`,
    "Findings so far:",
    ...recentFindings.map((f) => `- [${f.status}] ${f.statement}`),
    "Files in the data room:",
    ...recentSources.map((s) => `- ${s.filename}`),
  ].join("\n");

  try {
    const resolved = await resolveProvider(db, user.firmId, membership.engagement.aiProviderId);
    const result = await completeAndMeter(
      db,
      resolved,
      {
        system:
          "You support a management consulting team. Answer from the engagement context provided. " +
          "If the context does not contain the answer, say what data would be needed instead of guessing.\n\n" +
          context,
        messages: [{ role: "user", content: parsed.data.question }],
      },
      { firmId: user.firmId, engagementId: id, userId: user.id, feature: "ask" },
    );
    if (result.refused) {
      return NextResponse.json({ error: "The model declined this question. Try rephrasing it." }, { status: 422 });
    }
    return NextResponse.json({ answer: result.text, model: result.model });
  } catch (err) {
    console.error("ask failed", err);
    // Show configuration problems to developers; keep production errors generic.
    const message =
      process.env.NODE_ENV !== "production" && err instanceof Error
        ? err.message
        : "The model could not be reached. Check this firm's AI connection.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
