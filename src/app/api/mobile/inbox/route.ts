import { NextResponse } from "next/server";
import { mobileAuth } from "@/lib/mobile/data";
import { readInbox, syncNotifications } from "@/lib/notifications/sync";

/**
 * My activity feed, newest first, from stored notifications: mentions of me, replies in threads
 * I started or joined, tasks and to-dos given to me, and tasks waiting on my review.
 * Syncs first, so anything missed at send time (or from before the table existed) shows up.
 */
export async function GET() {
  const auth = await mobileAuth();
  if (auth instanceof NextResponse) return auth;
  const { db, user } = auth;
  const now = new Date();
  const cases = await syncNotifications(db, user, now);
  // The phone app learns expert approvals in its next release.
  const items = (await readInbox(db, user, cases, now)).filter((i) => i.kind !== "approval");
  return NextResponse.json({ items });
}
