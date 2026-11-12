import type { NotificationKind } from "@/db/schema";

/** Sign-offs keep reminding until someone acts. */
export const NUDGE_KINDS: readonly NotificationKind[] = ["review", "approval"];
export const NUDGE_EVERY_MS = 24 * 60 * 60 * 1000;

/** When a newly added (or reopened) item first reminds, or null if it never does. */
export function firstNudgeAt(kind: NotificationKind, now: Date): Date | null {
  return NUDGE_KINDS.includes(kind) ? new Date(now.getTime() + NUDGE_EVERY_MS) : null;
}
