import { NextResponse } from "next/server";
import { z } from "zod";
import { setInboxStatus } from "@/lib/inbox/status";
import { SNOOZE_CHOICES } from "@/lib/inbox/snooze";
import { mobileAuth } from "@/lib/mobile/data";
import { readInbox, syncNotifications } from "@/lib/notifications/sync";

const View = z.enum(["open", "snoozed", "done"]).catch("open");

/** My Needs-you items in one view (open, snoozed or done). Web, desktop and iPhone share it. */
export async function GET(req: Request) {
  const auth = await mobileAuth();
  if (auth instanceof NextResponse) return auth;
  const { db, user } = auth;
  const view = View.parse(new URL(req.url).searchParams.get("view"));
  const now = new Date();
  const cases = await syncNotifications(db, user, now);
  return NextResponse.json({ items: await readInbox(db, user, cases, now, 200, view) });
}

const Body = z.object({
  key: z.string().min(1).max(80),
  action: z.enum(["read", "done", "reopen", "snooze"]),
  until: z.enum(SNOOZE_CHOICES).optional(),
});

/** Marks one of my items read, done, snoozed or open again. */
export async function POST(req: Request) {
  const auth = await mobileAuth();
  if (auth instanceof NextResponse) return auth;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const { key, action, until } = parsed.data;
  if (action === "snooze" && !until) return NextResponse.json({ error: "Pick a time" }, { status: 400 });
  const found = await setInboxStatus(auth.db, auth.user, key, action === "snooze" ? { action, until: until! } : { action });
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
