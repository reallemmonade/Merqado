import { and, count, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { engagementMembers, notifications } from "@/db/schema";
import { inboxViewWhere, type InboxView } from "@/lib/notifications/sync";
import { snoozeUntil, type SnoozeChoice } from "./snooze";

export type InboxAction = { action: "read" } | { action: "done" } | { action: "reopen" } | { action: "snooze"; until: SnoozeChoice };

/**
 * Applies the person's own choice to one of their notifications. Done and snooze stick until the
 * source changes; an item the person marked done never comes back on its own.
 * Returns false when there's no such notification.
 */
export async function setInboxStatus(db: DB, user: { id: string; timeZone: string | null }, key: string, a: InboxAction, now = new Date()): Promise<boolean> {
  const mine = and(eq(notifications.userId, user.id), eq(notifications.key, key));
  const row = await db.query.notifications.findFirst({ where: mine, columns: { status: true, doneBy: true } });
  if (!row) return false;
  if (a.action === "read") {
    if (row.status === "unread") await db.update(notifications).set({ status: "read", updatedAt: now }).where(mine);
    return true;
  }
  if (a.action === "reopen") {
    // Something the system closed because its source is gone stays closed.
    if (row.status === "done" && row.doneBy === "system") return true;
    await db.update(notifications).set({ status: "read", doneBy: null, snoozeUntil: null, updatedAt: now }).where(mine);
    return true;
  }
  if (row.status === "done") return true;
  if (a.action === "done") {
    await db.update(notifications).set({ status: "done", doneBy: "user", snoozeUntil: null, updatedAt: now }).where(mine);
  } else {
    await db.update(notifications).set({ status: "snoozed", snoozeUntil: snoozeUntil(a.until, now, user.timeZone), updatedAt: now }).where(mine);
  }
  return true;
}

/** How many notifications sit in one view for this person, on the cases they're still on. */
export async function countView(db: DB, userId: string, view: InboxView, now = new Date()): Promise<number> {
  const [r] = await db
    .select({ n: count() })
    .from(notifications)
    .innerJoin(engagementMembers, and(eq(engagementMembers.engagementId, notifications.engagementId), eq(engagementMembers.userId, notifications.userId)))
    .where(and(eq(notifications.userId, userId), inboxViewWhere(view, now)));
  return r?.n ?? 0;
}

export async function inboxCounts(db: DB, userId: string, now = new Date()): Promise<Record<InboxView, number>> {
  const [open, snoozed, done] = await Promise.all((["open", "snoozed", "done"] as const).map((v) => countView(db, userId, v, now)));
  return { open: open!, snoozed: snoozed!, done: done! };
}

/** Open items, for the nav badge. */
export const needsYouCount = (db: DB, userId: string, now = new Date()) => countView(db, userId, "open", now);
