import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import type { DB } from "@/db/client";
import type { Person } from "@/lib/notifications/derive";
import { readInbox, syncNotifications, type InboxView } from "@/lib/notifications/sync";
import { inboxCounts, needsYouCount, setInboxStatus } from "./status";

const dir = mkdtempSync(path.join(tmpdir(), "merqado-inbox-"));
const db = drizzle(createClient({ url: `file:${path.join(dir, "t.db")}` }), { schema }) as unknown as DB;
let me: Person & { timeZone: string | null };
let other: string;
let caseId: string;
let moduleId: string;

async function view(v: InboxView, now = new Date()) {
  const cases = await syncNotifications(db, me, now);
  return (await readInbox(db, me, cases, now, 100, v)).map((i) => i.id);
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  const [firm] = await db.insert(schema.firms).values({ name: "Test firm", slug: "test-firm" }).returning();
  const [role] = await db.insert(schema.firmRoles).values({ firmId: firm!.id, title: "Consultant", archetype: "consultant" }).returning();
  const [a] = await db.insert(schema.users).values({ email: "a@test.example", name: "Person 01" }).returning();
  const [b] = await db.insert(schema.users).values({ email: "b@test.example", name: "Person 02" }).returning();
  await db.insert(schema.firmMembers).values([
    { firmId: firm!.id, userId: a!.id, firmRoleId: role!.id },
    { firmId: firm!.id, userId: b!.id, firmRoleId: role!.id },
  ]);
  const [eng] = await db.insert(schema.engagements).values({ firmId: firm!.id, clientName: "Project Atlas", title: "Market study" }).returning();
  caseId = eng!.id;
  await db.insert(schema.engagementMembers).values([
    { engagementId: caseId, userId: a!.id },
    { engagementId: caseId, userId: b!.id },
  ]);
  const [mod] = await db.insert(schema.workplanModules).values({ engagementId: caseId, name: "Market sizing" }).returning();
  moduleId = mod!.id;
  me = { id: a!.id, firmId: firm!.id, archetype: "consultant", timeZone: "UTC" };
  other = b!.id;
});

async function newTask(title: string) {
  const [t] = await db.insert(schema.workplanTasks).values({ engagementId: caseId, moduleId, title, assigneeId: me.id, createdBy: other }).returning();
  return t!;
}

describe("Needs-you status", () => {
  it("done sticks through later syncs and can be reopened", async () => {
    const t = await newTask("Size the market");
    const key = `t-${t.id}`;
    expect(await view("open")).toContain(key);
    expect(await setInboxStatus(db, me, key, { action: "done" })).toBe(true);
    expect(await view("open")).not.toContain(key);
    expect(await view("done")).toContain(key);
    expect(await setInboxStatus(db, me, key, { action: "reopen" })).toBe(true);
    expect(await view("open")).toContain(key);
  });

  it("snooze hides an item until its time, then it's back", async () => {
    const t = await newTask("Call OEM 07");
    const key = `t-${t.id}`;
    const now = new Date();
    expect(await view("open", now)).toContain(key);
    await setInboxStatus(db, me, key, { action: "snooze", until: "hour" }, now);
    expect(await view("open", now)).not.toContain(key);
    expect(await view("snoozed", now)).toContain(key);
    const later = new Date(now.getTime() + 61 * 60 * 1000);
    expect(await view("open", later)).toContain(key);
  });

  it("auto-clears when the source resolves, and a system close can't be reopened", async () => {
    const t = await newTask("Check model");
    const key = `t-${t.id}`;
    expect(await view("open")).toContain(key);
    expect(await setInboxStatus(db, me, key, { action: "snooze", until: "tomorrow" })).toBe(true);
    await db.update(schema.workplanTasks).set({ status: "done" }).where(eq(schema.workplanTasks.id, t.id));
    expect(await view("done")).toContain(key);
    await setInboxStatus(db, me, key, { action: "reopen" });
    expect(await view("open")).not.toContain(key);
  });

  it("marks read, counts views, and ignores other people's keys", async () => {
    const t = await newTask("Draft summary");
    const key = `t-${t.id}`;
    await view("open");
    await setInboxStatus(db, me, key, { action: "read" });
    const row = await db.query.notifications.findFirst({ where: eq(schema.notifications.key, key) });
    expect(row?.status).toBe("read");
    const counts = await inboxCounts(db, me.id);
    expect(counts.open).toBe(await needsYouCount(db, me.id));
    expect(counts.open).toBeGreaterThan(0);
    expect(await setInboxStatus(db, { id: other, timeZone: null }, key, { action: "done" })).toBe(false);
  });
});
