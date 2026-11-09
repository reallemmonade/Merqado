import { NextResponse } from "next/server";
import { and, asc, eq, or } from "drizzle-orm";
import { gptChats, gptMessages } from "@/db/schema";
import { authorize } from "@/lib/experts/api";

/** One case GPT chat with its answers and the sources they cite. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; chatId: string }> }) {
  const { id, chatId } = await params;
  const auth = await authorize(id, "ask");
  if (auth instanceof NextResponse) return auth;
  const { db, user } = auth;
  const chat = await db.query.gptChats.findFirst({
    where: and(eq(gptChats.id, chatId), eq(gptChats.engagementId, id), or(eq(gptChats.userId, user.id), eq(gptChats.shared, true))),
  });
  if (!chat) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const msgs = await db.select().from(gptMessages).where(eq(gptMessages.chatId, chatId)).orderBy(asc(gptMessages.createdAt));
  return NextResponse.json({
    chat: { id: chat.id, title: chat.title, shared: chat.shared, mine: chat.userId === user.id },
    messages: msgs.map((m) => ({ id: m.id, role: m.role, body: m.body, sources: safeJson(m.sources), at: m.createdAt.toISOString() })),
  });
}

function safeJson(s: string): unknown[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
