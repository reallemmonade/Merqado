import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { caseNotes, gptChats, gptMessages } from "@/db/schema";
import { aiError, notFoundJson, ok, parseOp, runAi } from "@/lib/case/api";
import type { Authorized } from "@/lib/experts/api";
import { loadCorpus } from "@/lib/case/corpus";
import { gptName } from "@/lib/case/names";
import { SOURCE_KINDS, type SourceKind } from "@/lib/case/gptSources";
import { chunk, topSnippets, type Snippet } from "@/lib/case/search";

const ref = z.string().min(1).max(64);
const question = z.string().trim().min(1, "Ask a question.").max(4000);
const kinds = z.array(z.enum(SOURCE_KINDS.map((s) => s.kind) as [SourceKind, ...SourceKind[]])).max(20).optional();

const Op = z.discriminatedUnion("op", [
  z.object({ op: z.literal("new"), question, shared: z.boolean().optional() }),
  z.object({ op: z.literal("ask"), chatId: ref, question, kinds }),
  z.object({ op: z.literal("answer"), chatId: ref, kinds }),
  z.object({ op: z.literal("rename"), chatId: ref, title: z.string().trim().min(1).max(200) }),
  z.object({ op: z.literal("folder"), chatId: ref, folder: z.string().trim().max(60) }),
  z.object({ op: z.literal("share"), chatId: ref, shared: z.boolean() }),
  z.object({ op: z.literal("pin"), chatId: ref }),
  z.object({ op: z.literal("delete"), chatId: ref }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await parseOp(req, id, "ask", Op);
  if (r instanceof NextResponse) return r;
  const { auth, op } = r;
  const { db, user } = auth;

  if (op.op === "new") {
    const [chat] = await db.insert(gptChats).values({ engagementId: id, userId: user.id, title: titleFrom(op.question), shared: op.shared ?? false }).returning();
    await db.insert(gptMessages).values({ chatId: chat!.id, role: "user", body: op.question });
    return ok({ id: chat!.id });
  }

  // Only the person who started a chat can change it or keep asking in it.
  const chat = await db.query.gptChats.findFirst({ where: and(eq(gptChats.id, op.chatId), eq(gptChats.engagementId, id), eq(gptChats.userId, user.id)) });
  if (!chat) return notFoundJson();
  const touch = () => db.update(gptChats).set({ updatedAt: new Date() }).where(eq(gptChats.id, chat.id));

  switch (op.op) {
    case "ask":
      await db.insert(gptMessages).values({ chatId: chat.id, role: "user", body: op.question });
      await touch();
      return answer(auth, chat.id, op.kinds);
    case "answer":
      return answer(auth, chat.id, op.kinds);
    case "rename":
      await db.update(gptChats).set({ title: op.title }).where(eq(gptChats.id, chat.id));
      return ok();
    case "folder":
      await db.update(gptChats).set({ folder: op.folder }).where(eq(gptChats.id, chat.id));
      return ok();
    case "share":
      await db.update(gptChats).set({ shared: op.shared }).where(eq(gptChats.id, chat.id));
      return ok();
    case "pin": {
      const msgs = await db.select().from(gptMessages).where(eq(gptMessages.chatId, chat.id)).orderBy(asc(gptMessages.createdAt));
      const last = [...msgs].reverse().find((m) => m.role === "assistant");
      await db.update(gptChats).set({ pinned: true }).where(eq(gptChats.id, chat.id));
      await db.insert(caseNotes).values({
        engagementId: id,
        kind: "note",
        body: last ? `${chat.title}\n\n${last.body.replace(/\s*\[\d{1,3}\]/g, "")}` : chat.title,
        origin: gptName(auth.engagement.clientName),
        link: `/e/${id}/gpt/${chat.id}`,
        isPrivate: !chat.shared,
        createdBy: user.id,
      });
      return ok();
    }
    case "delete":
      await db.delete(gptChats).where(eq(gptChats.id, chat.id));
      // A note pinned from this chat keeps its text but no longer links to a chat that is gone.
      await db.update(caseNotes).set({ link: null }).where(and(eq(caseNotes.engagementId, id), eq(caseNotes.link, `/e/${id}/gpt/${chat.id}`)));
      return ok();
  }
}

function titleFrom(q: string) {
  const t = q.replace(/\s+/g, " ").trim();
  return t.length > 70 ? t.slice(0, 67).trimEnd() + "…" : t;
}

/** Answers the chat's latest question from the case's own material, citing it. */
async function answer(auth: Authorized, chatId: string, only: SourceKind[] = []) {
  const { db, user, engagement } = auth;
  const msgs = await db.select().from(gptMessages).where(eq(gptMessages.chatId, chatId)).orderBy(asc(gptMessages.createdAt));
  const last = msgs[msgs.length - 1];
  if (!last || last.role !== "user") return ok();

  const all = await loadCorpus(db, engagement.id, user);
  const corpus = only.length ? all.filter((s) => only.includes(s.kind)) : all;
  const pieces: Snippet[] = corpus.flatMap((s) => (s.kind === "transcript" || s.kind === "file" ? chunk(s.text).map((text) => ({ ...s, text })) : [s]));
  const priorQuestion = [...msgs].reverse().find((m) => m.role === "user" && m.id !== last.id)?.body ?? "";
  const picked = topSnippets(pieces, `${last.body} ${priorQuestion}`, 30, 40000);
  const numbered = picked.map((s, i) => ({ n: i + 1, label: s.label, href: s.href, text: s.text }));
  const name = gptName(engagement.clientName);

  const system = [
    `You are ${name}, the research assistant for the consulting case ${engagement.clientName} (${engagement.title}).`,
    "Answer only from the numbered case extracts below. Cite every claim with its extract number in square brackets, like [3].",
    "Quote experts word for word in quotation marks when a quote helps. Refer to experts by their role, never by name.",
    "Be brief: lead with the answer, then a few short bullet points. If the extracts do not answer the question, say so in one sentence and name what is missing.",
    "",
    "Case extracts:",
    ...numbered.map((s) => `[${s.n}] (${s.label})\n${s.text}`),
  ].join("\n");

  const recent = msgs.slice(-7);
  while (recent[0]?.role === "assistant") recent.shift();
  const history = recent.map((m) => ({ role: m.role, content: m.body.replace(/\s*\[\d{1,3}\]/g, "") }));
  let text: string;
  try {
    text = await runAi(auth, "case_gpt", { system, messages: history, maxTokens: 1500 });
  } catch (err) {
    return aiError(err);
  }
  const cited = new Set([...text.matchAll(/\[(\d{1,3})\]/g)].map((m) => Number(m[1])));
  const sources = numbered.filter((s) => cited.has(s.n)).map((s) => ({ ...s, text: s.text.slice(0, 600) }));
  await db.insert(gptMessages).values({ chatId, role: "assistant", body: text, sources: JSON.stringify(sources) });
  await db.update(gptChats).set({ updatedAt: new Date() }).where(eq(gptChats.id, chatId));
  return ok();
}
