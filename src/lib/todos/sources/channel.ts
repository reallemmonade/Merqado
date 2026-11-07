import { and, desc, eq, gte } from "drizzle-orm";
import { chatMessages, chatRooms, users } from "@/db/schema";
import { canSeeRoom, parseArchetypes } from "@/lib/case/rooms";
import type { SourceMessage, TodoSource } from "./types";

/** The case's own Team channel chats, limited to rooms the scanner's role can see. */
export const channelSource: TodoSource = {
  kind: "channel",
  label: "Team channel",
  isConnected: async () => true,
  async fetchMessages({ db, engagementId, viewer, since, limit }) {
    const rows = await db
      .select({
        id: chatMessages.id,
        body: chatMessages.body,
        createdAt: chatMessages.createdAt,
        roomId: chatRooms.id,
        room: chatRooms.name,
        archetypes: chatRooms.archetypes,
        author: users.name,
      })
      .from(chatMessages)
      .innerJoin(chatRooms, eq(chatRooms.id, chatMessages.roomId))
      .leftJoin(users, eq(users.id, chatMessages.userId))
      .where(and(eq(chatMessages.engagementId, engagementId), gte(chatMessages.createdAt, since)))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit);
    return rows
      .filter((r) => canSeeRoom(r.archetypes, viewer.archetype))
      .reverse()
      .map(
        (r): SourceMessage => ({
          source: "channel",
          key: `channel:${r.id}`,
          container: r.room,
          author: r.author ?? "Former member",
          at: r.createdAt,
          text: r.body,
          link: `/e/${engagementId}/channel?room=${r.roomId}#m-${r.id}`,
          audience: parseArchetypes(r.archetypes),
        }),
      );
  },
};
