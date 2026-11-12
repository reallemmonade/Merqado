import { and, desc, eq, ne } from "drizzle-orm";
import type { DB } from "@/db/client";
import { chatMessages, workplanTasks } from "@/db/schema";

const EXPERT_ASK = /\b(experts?|interviews?|calls?|IVs?|book|network|GLG|AlphaSights|Guidepoint|Third Bridge)\b/i;
const RECENT_MS = 14 * 24 * 60 * 60 * 1000;

/** True when text reads like a request for an expert or a call. */
export function isExpertAsk(text: string): boolean {
  return EXPERT_ASK.test(text);
}

/**
 * Who most likely asked this person to find an expert: whoever assigned them an open
 * expert-related task, else whoever @mentioned them about experts in the Team channel lately.
 */
export async function guessRequester(db: DB, engagementId: string, proposerId: string): Promise<string | null> {
  const tasks = await db
    .select({ title: workplanTasks.title, createdBy: workplanTasks.createdBy })
    .from(workplanTasks)
    .where(and(eq(workplanTasks.engagementId, engagementId), eq(workplanTasks.assigneeId, proposerId), ne(workplanTasks.status, "done")))
    .orderBy(desc(workplanTasks.createdAt));
  const fromTask = tasks.find((t) => t.createdBy && t.createdBy !== proposerId && isExpertAsk(t.title));
  if (fromTask) return fromTask.createdBy;

  const since = Date.now() - RECENT_MS;
  const msgs = await db
    .select({
      userId: chatMessages.userId,
      body: chatMessages.body,
      mentions: chatMessages.mentions,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(eq(chatMessages.engagementId, engagementId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(300);
  const fromChat = msgs.find(
    (m) => m.userId && m.userId !== proposerId && m.createdAt.getTime() >= since && m.mentions.includes(proposerId) && isExpertAsk(m.body),
  );
  return fromChat?.userId ?? null;
}
