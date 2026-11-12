import { and, asc, desc, eq, gt, inArray, lte, ne, notInArray, or, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { firmMembers, firmRoles, notifications, users, type Archetype } from "@/db/schema";
import { myCases } from "@/lib/mobile/data";
import { firstNudgeAt } from "@/lib/inbox/nudge-time";
import { deriveInbox, type InboxCase, type Person } from "./derive";

const CHUNK = 50;

/**
 * Brings one person's stored notifications in step with their chats, to-dos and tasks:
 * new items are added as unread, changed ones are updated, and ones whose source went away
 * (task finished, to-do closed, message deleted, chat hidden, too old) are closed.
 * Status the person set (read, snoozed, done) is kept. Safe to run any time, as often as needed.
 */
export async function syncNotifications(db: DB, user: Person, now = new Date()): Promise<InboxCase[]> {
  const cases = await myCases(db, user);
  const items = await deriveInbox(db, user, cases, now);

  // An item closed by the system that needs the person again (e.g. a task sent back) reopens.
  const reopen = sql`${notifications.status} = 'done' and ${notifications.doneBy} = 'system'`;
  for (let i = 0; i < items.length; i += CHUNK) {
    await db
      .insert(notifications)
      .values(
        items.slice(i, i + CHUNK).map((it) => ({
          userId: user.id,
          engagementId: it.caseId,
          kind: it.kind,
          key: it.key,
          title: it.title,
          body: it.body,
          link: it.link,
          data: JSON.stringify(it.data),
          occurredAt: it.at,
          nextNudgeAt: firstNudgeAt(it.kind, now),
          createdAt: now,
          updatedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: [notifications.userId, notifications.key],
        set: {
          engagementId: sql`excluded.engagement_id`,
          kind: sql`excluded.kind`,
          title: sql`excluded.title`,
          body: sql`excluded.body`,
          link: sql`excluded.link`,
          data: sql`excluded.data`,
          occurredAt: sql`excluded.occurred_at`,
          nextNudgeAt: sql`coalesce(${notifications.nextNudgeAt}, excluded.next_nudge_at)`,
          status: sql`case when ${reopen} then 'unread' else ${notifications.status} end`,
          doneBy: sql`case when ${reopen} then null else ${notifications.doneBy} end`,
          updatedAt: now,
        },
      });
  }

  const keys = items.map((it) => it.key);
  await db
    .update(notifications)
    .set({ status: "done", doneBy: "system", updatedAt: now })
    .where(and(eq(notifications.userId, user.id), ne(notifications.status, "done"), ...(keys.length ? [notInArray(notifications.key, keys)] : [])));
  return cases;
}

/** Syncs everyone listed, as members of this firm. Never throws. */
export async function syncNotificationsFor(db: DB, firmId: string, userIds: string[]): Promise<void> {
  const ids = [...new Set(userIds)];
  if (!ids.length) return;
  try {
    const people = await firmPeople(db, and(eq(firmMembers.firmId, firmId), inArray(firmMembers.userId, ids)));
    for (const p of people) await syncNotifications(db, p);
  } catch (err) {
    console.error("notification sync failed", err);
  }
}

/** Fills the table for every firm member, e.g. once after deploy. Returns how many people it synced. */
export async function syncAllNotifications(db: DB): Promise<number> {
  const people = await firmPeople(db);
  for (const p of people) await syncNotifications(db, p);
  return people.length;
}

/** These people, once per firm they belong to. */
export function peopleByIds(db: DB, ids: string[]): Promise<Person[]> {
  return ids.length ? firmPeople(db, inArray(firmMembers.userId, ids)) : Promise.resolve([]);
}

async function firmPeople(db: DB, where?: ReturnType<typeof and>): Promise<Person[]> {
  return db
    .select({ id: firmMembers.userId, firmId: firmMembers.firmId, archetype: firmRoles.archetype, timeZone: users.timeZone })
    .from(firmMembers)
    .innerJoin(firmRoles, eq(firmRoles.id, firmMembers.firmRoleId))
    .innerJoin(users, eq(users.id, firmMembers.userId))
    .where(where)
    .orderBy(asc(firmMembers.userId)) as Promise<{ id: string; firmId: string; archetype: Archetype; timeZone: string | null }[]>;
}

export type InboxEntry = {
  id: string;
  kind: (typeof notifications.$inferSelect)["kind"];
  status: (typeof notifications.$inferSelect)["status"];
  caseId: string;
  caseName: string;
  title: string;
  body: string;
  at: string;
  link: string;
  roomId?: string;
  messageId?: string;
  threadId?: string;
  taskId?: string;
  todoId?: string;
  expertId?: string;
  flag?: "overdue" | "idle";
  days?: number;
  snoozeUntil?: string;
  doneBy?: "system" | "user";
};

/** Open: needs the person now. Snoozed: set aside until later. Done: closed by them or because the source resolved. */
export type InboxView = "open" | "snoozed" | "done";

export const DONE_SHOWN_MS = 14 * 24 * 60 * 60 * 1000;

/** Which stored rows each view shows. */
export function inboxViewWhere(view: InboxView, now: Date) {
  if (view === "snoozed") return and(eq(notifications.status, "snoozed"), gt(notifications.snoozeUntil, now));
  if (view === "done") return and(eq(notifications.status, "done"), gt(notifications.updatedAt, new Date(now.getTime() - DONE_SHOWN_MS)));
  return or(inArray(notifications.status, ["unread", "read"]), and(eq(notifications.status, "snoozed"), lte(notifications.snoozeUntil, now)));
}

/**
 * The person's notifications in one view. Open (the default) is unread, read, and snoozed ones whose
 * time is up, newest first; snoozed is soonest to wake first; done is most recently closed first.
 */
export async function readInbox(db: DB, user: Person, cases: InboxCase[], now = new Date(), limit = 100, view: InboxView = "open"): Promise<InboxEntry[]> {
  if (!cases.length) return [];
  const caseOf = new Map(cases.map((c) => [c.id, c]));
  const rows = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, user.id),
        inArray(notifications.engagementId, [...caseOf.keys()]),
        inboxViewWhere(view, now),
      ),
    )
    .orderBy(view === "snoozed" ? asc(notifications.snoozeUntil) : view === "done" ? desc(notifications.updatedAt) : desc(notifications.occurredAt))
    .limit(limit);
  return rows.map((r) => ({
    ...(parseData(r.data) as Pick<InboxEntry, "roomId" | "messageId" | "threadId" | "taskId" | "todoId" | "expertId" | "flag" | "days">),
    id: r.key,
    kind: r.kind,
    status: r.status,
    caseId: r.engagementId,
    caseName: caseOf.get(r.engagementId)?.codeName ?? "",
    title: r.title,
    body: r.body,
    at: r.occurredAt.toISOString(),
    link: r.link,
    ...(r.snoozeUntil ? { snoozeUntil: r.snoozeUntil.toISOString() } : {}),
    ...(r.doneBy ? { doneBy: r.doneBy } : {}),
  }));
}

function parseData(s: string): Record<string, string> {
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
