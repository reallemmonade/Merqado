import { eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { todos, type Archetype } from "@/db/schema";
import { extractJson } from "@/lib/experts/api";
import { buildPrompt, parseSuggestions, type Member } from "./extract";
import { TODO_SOURCE_REGISTRY, type SourceMessage } from "./sources";

export const SCAN_DAYS = 21;
export const SCAN_LIMIT = 400;

type Complete = (req: { system: string; messages: { role: "user"; content: string }[]; maxTokens: number }) => Promise<string>;

/**
 * Reads recent messages from every connected source, asks the model for to-dos, and stores
 * new ones as suggestions. Messages that already produced a to-do (kept, done or dismissed)
 * are not read again, so dismissed suggestions don't come back.
 */
export async function scanForTodos(
  db: DB,
  opts: { engagementId: string; viewer: { id: string; archetype: Archetype }; members: Member[]; now?: Date },
  complete: Complete,
): Promise<{ found: number; read: number }> {
  const now = opts.now ?? new Date();
  const ctx = { db, engagementId: opts.engagementId, viewer: opts.viewer, since: new Date(now.getTime() - SCAN_DAYS * 864e5), limit: SCAN_LIMIT };

  const prior = await db
    .select({ title: todos.title, status: todos.status, sourceKey: todos.sourceKey })
    .from(todos)
    .where(eq(todos.engagementId, opts.engagementId));
  const used = new Set(prior.map((p) => p.sourceKey).filter(Boolean));

  const messages: SourceMessage[] = [];
  for (const source of TODO_SOURCE_REGISTRY) {
    if (!(await source.isConnected(ctx))) continue;
    messages.push(...(await source.fetchMessages(ctx)));
  }
  const fresh = messages.filter((m) => !used.has(m.key)).sort((a, b) => a.at.getTime() - b.at.getTime());
  if (fresh.length === 0) return { found: 0, read: 0 };

  const existing = prior.filter((p) => p.status !== "done").map((p) => p.title).slice(-150);
  const { system, user } = buildPrompt(fresh, opts.members, existing, now.toISOString().slice(0, 10));
  const reply = await complete({ system, messages: [{ role: "user", content: user }], maxTokens: 3000 });
  const suggestions = parseSuggestions(extractJson(reply), fresh, opts.members, existing);

  if (suggestions.length) {
    await db.insert(todos).values(
      suggestions.map((s) => ({
        engagementId: opts.engagementId,
        title: s.title,
        assigneeId: s.assigneeId,
        dueDate: s.dueDate,
        status: "suggested" as const,
        source: s.message.source,
        sourceLabel: s.message.container,
        sourceLink: s.message.link,
        sourceKey: s.message.key,
        audience: s.message.audience ? JSON.stringify(s.message.audience) : null,
        createdBy: opts.viewer.id,
      })),
    );
  }
  return { found: suggestions.length, read: fresh.length };
}
