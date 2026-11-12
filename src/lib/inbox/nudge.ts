import { and, eq, inArray, isNotNull, lte } from "drizzle-orm";
import type { DB } from "@/db/client";
import { notifications, type NotificationKind } from "@/db/schema";
import { localTime } from "@/lib/cron/time-zone";
import { notifyUsers } from "@/lib/push/notify";
import { inboxViewWhere, peopleByIds, syncNotifications } from "@/lib/notifications/sync";
import { NUDGE_EVERY_MS, NUDGE_KINDS } from "./nudge-time";

export { firstNudgeAt } from "./nudge-time";

/** Reminders go out between these local hours only. */
export const NUDGE_HOURS = { from: 8, to: 20 };
const MAX_PER_PERSON = 20;
/** Phone notification category with Done and Snooze buttons (see mobile/src/lib/push.ts). */
export const NEEDS_CATEGORY = "NEEDS";


export function inNudgeHours(now: Date, tz: string | null | undefined): boolean {
  const { hour } = localTime(now, tz);
  return hour >= NUDGE_HOURS.from && hour < NUDGE_HOURS.to;
}

type Due = { key: string; kind: NotificationKind; title: string; snoozeUntil: Date | null };

/** One push for what's due: the item itself, or a count when there are several. */
export function nudgeMessage(due: Due[], now: Date): { title: string; body: string } {
  if (due.length > 1) return { title: `${due.length} items need you`, body: due.slice(0, 3).map(label).join(" · ") };
  const d = due[0]!;
  if (d.snoozeUntil && d.snoozeUntil <= now) return { title: "Back from snooze", body: label(d) };
  return { title: d.kind === "approval" ? "Expert waiting on you" : "Review waiting on you", body: d.title };
}

function label(d: Due): string {
  return d.kind === "approval" ? `Approve expert: ${d.title}` : d.kind === "review" ? `Review: ${d.title}` : d.title;
}

/**
 * Sends reminders whose time has come: sign-offs still waiting a day on, and snoozes that ended.
 * Syncs each person first, so anything already resolved closes instead of reminding.
 * Outside 08:00-20:00 in the person's zone it waits for the morning.
 */
export async function runNudges(db: DB, now = new Date()): Promise<{ people: number; pushed: number }> {
  const dueWhere = and(isNotNull(notifications.nextNudgeAt), lte(notifications.nextNudgeAt, now), inboxViewWhere("open", now));
  const users = await db.selectDistinct({ id: notifications.userId }).from(notifications).where(dueWhere);
  if (!users.length) return { people: 0, pushed: 0 };
  const people = await peopleByIds(db, users.map((u) => u.id));
  let pushed = 0;
  const seen = new Set<string>();
  for (const p of people) {
    await syncNotifications(db, p, now);
    if (seen.has(p.id) || !inNudgeHours(now, p.timeZone)) continue;
    seen.add(p.id);
    const due = await db
      .select({ key: notifications.key, kind: notifications.kind, title: notifications.title, snoozeUntil: notifications.snoozeUntil })
      .from(notifications)
      .where(and(eq(notifications.userId, p.id), dueWhere))
      .limit(MAX_PER_PERSON);
    if (!due.length) continue;
    // One item gets Done / Snooze buttons on the lock screen.
    const one = due.length === 1 ? { category: NEEDS_CATEGORY, data: { url: "/activity", key: due[0]!.key } } : { data: { url: "/activity" } };
    await notifyUsers(db, [p.id], { ...nudgeMessage(due, now), threadId: "needs-you", ...one });
    pushed++;
    for (const d of due) {
      await db
        .update(notifications)
        .set({
          nudgedAt: now,
          nextNudgeAt: NUDGE_KINDS.includes(d.kind) ? new Date(now.getTime() + NUDGE_EVERY_MS) : null,
          // A snooze that ended is open again.
          ...(d.snoozeUntil && d.snoozeUntil <= now ? { status: "read" as const, snoozeUntil: null } : {}),
        })
        .where(and(eq(notifications.userId, p.id), inArray(notifications.key, [d.key])));
    }
  }
  return { people: seen.size, pushed };
}
