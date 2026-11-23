import { and, eq, inArray, ne } from "drizzle-orm";
import type { DB } from "@/db/client";
import { engagementMembers, engagements, gmailLinks, notifications } from "@/db/schema";
import { NEEDS_CATEGORY } from "@/lib/inbox/nudge";
import { notifyUsers } from "@/lib/push/notify";
import { gmailAccess, gmailCall, GmailError } from "./gmail";

/** Most threads alerted per person per check; a flood after a long gap stays readable. */
const MAX_NEW = 25;
const MAX_PAGES = 5;
/** Inbox tabs Gmail itself doesn't notify about. */
const QUIET_LABELS = ["SENT", "DRAFT", "SPAM", "TRASH", "CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "CATEGORY_FORUMS"];

type Msg = { id: string; threadId: string; labelIds?: string[] };
export type HistoryPage = {
  history?: { messagesAdded?: { message: Msg }[]; labelsRemoved?: { message: Msg; labelIds?: string[] }[] }[];
  historyId?: string;
  nextPageToken?: string;
};

/** True for mail that should alert: unread, in the inbox, not sent by me or in a quiet tab. */
export function isAlertable(labels: string[] = []): boolean {
  return labels.includes("INBOX") && labels.includes("UNREAD") && !labels.some((l) => QUIET_LABELS.includes(l));
}

/**
 * Reads Gmail history in order: threads with new alertable mail (latest message each), and
 * threads read or archived since, whose alerts close.
 */
export function readHistory(pages: HistoryPage[]): { added: Map<string, string>; closed: Set<string> } {
  const added = new Map<string, string>();
  const closed = new Set<string>();
  for (const page of pages) {
    for (const h of page.history ?? []) {
      for (const { message: m } of h.messagesAdded ?? []) {
        if (!isAlertable(m.labelIds)) continue;
        added.set(m.threadId, m.id);
        closed.delete(m.threadId);
      }
      for (const r of h.labelsRemoved ?? []) {
        if (!r.labelIds?.some((l) => l === "UNREAD" || l === "INBOX")) continue;
        if (added.get(r.message.threadId) === r.message.id) added.delete(r.message.threadId);
        closed.add(r.message.threadId);
      }
    }
  }
  for (const t of added.keys()) closed.delete(t);
  return { added, closed };
}

/** "Name <a@b.c>" becomes "Name"; a bare address stays as it is. */
export function senderName(from: string): string {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  const name = m ? m[1]!.trim() || m[2]!.trim() : from.trim();
  return name.slice(0, 120) || "Unknown";
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Client names on the person's cases become "Client", so alerts never show them. */
export function hideClients(text: string, clientNames: string[]): string {
  let t = text.replace(/\s+/g, " ").trim();
  for (const n of clientNames) {
    const name = n.trim();
    if (name.length < 3 || name.toLowerCase() === "client") continue;
    t = t.replace(new RegExp(esc(name), "giu"), "Client");
  }
  return t;
}

export const gmailThreadLink = (account: string, threadId: string) =>
  `https://mail.google.com/mail/?authuser=${encodeURIComponent(account)}#inbox/${threadId}`;

type Header = { name: string; value: string };
type MessageMeta = { id: string; threadId: string; internalDate?: string; payload?: { headers?: Header[] } };

/** Checks one person's Gmail and stores an alert per thread with new mail. */
export async function checkPerson(db: DB, link: typeof gmailLinks.$inferSelect, now = new Date()): Promise<{ added: number; closed: number }> {
  const token = await gmailAccess(db, link.userId);
  if (!token) return { added: 0, closed: 0 };

  if (!link.historyId) {
    const p = await gmailCall<{ historyId?: string }>(token, "/profile");
    await db.update(gmailLinks).set({ historyId: p.historyId ?? null, checkedAt: now, lastError: null }).where(eq(gmailLinks.userId, link.userId));
    return { added: 0, closed: 0 };
  }

  const pages: HistoryPage[] = [];
  let pageToken: string | undefined;
  try {
    do {
      const qs = new URLSearchParams({ startHistoryId: link.historyId, historyTypes: "messageAdded" });
      qs.append("historyTypes", "labelRemoved");
      if (pageToken) qs.set("pageToken", pageToken);
      const page = await gmailCall<HistoryPage>(token, `/history?${qs}`);
      pages.push(page);
      pageToken = page.nextPageToken;
    } while (pageToken && pages.length < MAX_PAGES);
  } catch (e) {
    // Too old to replay (Gmail keeps about a week): start again from now.
    if (e instanceof GmailError && e.status === 404) {
      const p = await gmailCall<{ historyId?: string }>(token, "/profile");
      await db.update(gmailLinks).set({ historyId: p.historyId ?? null, checkedAt: now, lastError: null }).where(eq(gmailLinks.userId, link.userId));
      return { added: 0, closed: 0 };
    }
    throw e;
  }
  const nextHistoryId = pages.map((p) => p.historyId).filter(Boolean).pop() ?? link.historyId;
  const { added, closed } = readHistory(pages);

  if (closed.size) {
    await db
      .update(notifications)
      .set({ status: "done", doneBy: "system", snoozeUntil: null, updatedAt: now })
      .where(and(eq(notifications.userId, link.userId), eq(notifications.kind, "email"), ne(notifications.status, "done"), inArray(notifications.key, [...closed].map((t) => `e-${t}`))));
  }

  const clientNames = added.size
    ? (
        await db
          .select({ name: engagements.clientName })
          .from(engagements)
          .innerJoin(engagementMembers, eq(engagementMembers.engagementId, engagements.id))
          .where(eq(engagementMembers.userId, link.userId))
      ).map((r) => r.name)
    : [];

  const fresh: { key: string; title: string; body: string }[] = [];
  for (const [threadId, messageId] of [...added].slice(-MAX_NEW)) {
    let meta: MessageMeta;
    try {
      meta = await gmailCall<MessageMeta>(token, `/messages/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`);
    } catch (e) {
      if (e instanceof GmailError && e.status === 404) continue; // deleted since
      throw e;
    }
    const header = (n: string) => meta.payload?.headers?.find((h) => h.name.toLowerCase() === n)?.value ?? "";
    const title = hideClients(senderName(header("from")), clientNames).slice(0, 120);
    const body = hideClients(header("subject"), clientNames).slice(0, 200) || "No subject";
    const at = meta.internalDate ? new Date(Number(meta.internalDate)) : now;
    const key = `e-${threadId}`;
    const values = {
      userId: link.userId,
      engagementId: null,
      kind: "email" as const,
      key,
      title,
      body,
      link: gmailThreadLink(link.account, threadId),
      data: JSON.stringify({ gmailThreadId: threadId }),
      occurredAt: at,
      nudgedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    // A new message on a thread already alerted (even one closed) brings it back as unread.
    await db
      .insert(notifications)
      .values(values)
      .onConflictDoUpdate({
        target: [notifications.userId, notifications.key],
        set: { title, body, link: values.link, occurredAt: at, nudgedAt: now, status: "unread", doneBy: null, snoozeUntil: null, nextNudgeAt: null, updatedAt: now },
      });
    fresh.push({ key, title, body });
  }

  await db.update(gmailLinks).set({ historyId: nextHistoryId, checkedAt: now, lastError: null }).where(eq(gmailLinks.userId, link.userId));

  if (fresh.length) {
    const one = fresh.length === 1 ? fresh[0]! : null;
    await notifyUsers(db, [link.userId], {
      title: one ? one.title : `${fresh.length} new emails`,
      body: one ? one.body : fresh.slice(0, 3).map((f) => f.title).join(" · "),
      threadId: "email",
      ...(one ? { category: NEEDS_CATEGORY, data: { url: "/activity", key: one.key } } : { data: { url: "/activity" } }),
    });
  }
  return { added: fresh.length, closed: closed.size };
}

/** The 15-minute job: every linked Gmail, one person at a time. One failure doesn't stop the rest. */
export async function runGmailCheck(db: DB, now = new Date()): Promise<{ people: number; added: number; failed: number }> {
  const links = await db.select().from(gmailLinks);
  let added = 0;
  let failed = 0;
  for (const link of links) {
    try {
      added += (await checkPerson(db, link, now)).added;
    } catch (e) {
      failed++;
      const message = e instanceof Error ? e.message.slice(0, 300) : "Check failed";
      await db.update(gmailLinks).set({ lastError: message, checkedAt: now }).where(eq(gmailLinks.userId, link.userId));
    }
  }
  return { people: links.length, added, failed };
}
