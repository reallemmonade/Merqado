import { NextResponse } from "next/server";
import { and, desc, eq, or } from "drizzle-orm";
import { gptChats, users } from "@/db/schema";
import { gptName } from "@/lib/case/names";
import { authorize } from "@/lib/experts/api";

/** My case GPT chats and the team's shared ones. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id, "ask");
  if (auth instanceof NextResponse) return auth;
  const { db, user, engagement } = auth;
  const rows = await db
    .select({ id: gptChats.id, title: gptChats.title, shared: gptChats.shared, pinned: gptChats.pinned, updatedAt: gptChats.updatedAt, userId: gptChats.userId, owner: users.name })
    .from(gptChats)
    .innerJoin(users, eq(users.id, gptChats.userId))
    .where(and(eq(gptChats.engagementId, id), or(eq(gptChats.userId, user.id), eq(gptChats.shared, true))))
    .orderBy(desc(gptChats.updatedAt))
    .limit(100);
  return NextResponse.json({
    name: gptName(engagement.clientName),
    chats: rows.map((c) => ({ ...c, updatedAt: c.updatedAt.toISOString(), mine: c.userId === user.id })),
  });
}
