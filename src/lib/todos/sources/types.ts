import type { DB } from "@/db/client";
import type { Archetype, TodoSourceKind } from "@/db/schema";

/** One message from any source, in the shape the to-do extractor reads. */
export interface SourceMessage {
  source: Exclude<TodoSourceKind, "manual">;
  /** Stable across scans, e.g. "channel:<id>", "teams:<chatId>/<msgId>", "email:<internetMessageId>". */
  key: string;
  /** The chat, channel or email thread it was posted in. */
  container: string;
  author: string;
  at: Date;
  text: string;
  /** Where clicking the to-do's source should go. */
  link: string | null;
  /** Archetypes allowed to see it; null means everyone on the case. */
  audience: Archetype[] | null;
}

export interface SourceContext {
  db: DB;
  engagementId: string;
  /** Who is scanning. A source only returns what this person may read. */
  viewer: { id: string; archetype: Archetype };
  since: Date;
  limit: number;
}

/**
 * A place to-dos can be found. The in-app Team channel is the first one.
 * Microsoft Teams and Outlook/Gmail implement the same interface once connected.
 */
export interface TodoSource {
  kind: Exclude<TodoSourceKind, "manual">;
  label: string;
  /** False when the firm or person has not connected it yet. */
  isConnected(ctx: SourceContext): Promise<boolean>;
  fetchMessages(ctx: SourceContext): Promise<SourceMessage[]>;
}
