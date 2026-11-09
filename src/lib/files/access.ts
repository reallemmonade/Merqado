import type { DB } from "@/db/client";
import type { Archetype } from "@/db/schema";
import { visibleRooms } from "@/lib/case/data";

/**
 * Files posted in a chat are visible only to that chat's members. Returns a test for
 * whether this person may see a file.
 */
export async function sourceVisibility(db: DB, engagementId: string, archetype: Archetype): Promise<(s: { roomId: string | null }) => boolean> {
  const rooms = new Set((await visibleRooms(db, engagementId, archetype)).map((r) => r.id));
  return (s) => !s.roomId || rooms.has(s.roomId);
}
