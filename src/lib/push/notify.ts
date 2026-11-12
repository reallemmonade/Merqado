import { after } from "next/server";
import { inArray } from "drizzle-orm";
import type { DB } from "@/db/client";
import { pushDevices } from "@/db/schema";
import { apnsConfig, isDeadToken, sendApns, type ApnsMessage } from "@/lib/push/apns";
import { needsYouCount } from "@/lib/inbox/status";
import { syncNotificationsFor } from "@/lib/notifications/sync";

/**
 * Sends a notification to everyone listed on every iPhone they signed in on. Each person's app
 * icon badge is set to their open Needs-you count. Never throws: a failed push must not fail the
 * request that caused it.
 */
export async function notifyUsers(db: DB, userIds: string[], msg: ApnsMessage): Promise<void> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return;
  try {
    const cfg = apnsConfig();
    if (!cfg) return;
    const devices = await db.select().from(pushDevices).where(inArray(pushDevices.userId, ids));
    const dead: string[] = [];
    for (const id of ids) {
      const mine = devices.filter((d) => d.userId === id);
      if (!mine.length) continue;
      const badge = msg.badge ?? (await needsYouCount(db, id));
      for (const env of ["production", "sandbox"] as const) {
        const tokens = mine.filter((d) => d.environment === env).map((d) => d.token);
        const results = await sendApns(cfg, env, tokens, { ...msg, badge });
        for (const r of results) {
          if (isDeadToken(r)) dead.push(r.token);
          else if (r.status !== 200) console.error("push failed", r.status, r.reason);
        }
      }
    }
    if (dead.length) await db.delete(pushDevices).where(inArray(pushDevices.token, dead));
  } catch (err) {
    console.error("push failed", err);
  }
}

/**
 * Fire and forget, so the person who acted doesn't wait on Apple. Also brings the stored
 * notifications of everyone told up to date, so their inbox and reminders see it straight away.
 */
export function notifyLater(db: DB, firmId: string, userIds: string[] | (() => Promise<string[]>), msg: ApnsMessage): void {
  const run = async () => {
    const ids = typeof userIds === "function" ? await userIds() : userIds;
    // Sync first, so the badge counts the item this push is about.
    await syncNotificationsFor(db, firmId, ids);
    await notifyUsers(db, ids, msg);
  };
  try {
    after(run);
  } catch {
    void run().catch(() => {});
  }
}
