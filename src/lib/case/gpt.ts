import { inArray } from "drizzle-orm";
import type { DB } from "@/db/client";
import { users } from "@/db/schema";
import type { GptChatRow } from "@/components/case/GptList";
import { loadGptChats } from "./data";
import { shortDate } from "./progress";

export async function loadGptList(db: DB, engagementId: string, userId: string): Promise<GptChatRow[]> {
  const chats = await loadGptChats(db, engagementId, userId);
  const ownerIds = [...new Set(chats.map((c) => c.userId))];
  const owners = ownerIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ownerIds)) : [];
  const nameOf = new Map(owners.map((o) => [o.id, o.name]));
  return chats.map((c) => ({
    id: c.id,
    title: c.title,
    folder: c.folder,
    shared: c.shared,
    mine: c.userId === userId,
    owner: nameOf.get(c.userId) ?? "",
    updated: shortDate(c.updatedAt ? c.updatedAt.toISOString().slice(0, 10) : ""),
  }));
}
