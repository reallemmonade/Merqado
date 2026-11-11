import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import type { DB } from "@/db/client";
import type { Person } from "./derive";
import { readInbox, syncAllNotifications, syncNotifications } from "./sync";

const dir = mkdtempSync(path.join(tmpdir(), "merqado-notify-"));
const db = drizzle(createClient({ url: `file:${path.join(dir, "t.db")}` }), { schema }) as unknown as DB;
let me: Person;
let other: Person;
let caseId: string;
let roomId: string;
let moduleId: string;

const row = (key: string) => db.query.notifications.findFirst({ where: and(eq(schema.notifications.userId, me.id), eq(schema.notifications.key, key)) });
async function inbox() {
  const cases = await syncNotifications(db, me);
  return readInbox(db, me, cases);
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
  const [room] = await db.insert(schema.chatRooms).values({ engagementId: caseId, name: "Core team", archetypes: JSON.stringify(["consultant"]) }).returning();
  roomId = room!.id;
  const [mod] = await db.insert(schema.workplanModules).values({ engagementId: caseId, name: "Market sizing" }).returning();
  moduleId = mod!.id;
  me = { id: a!.id, firmId: firm!.id, archetype: "consultant" };
  other = { id: b!.id, firmId: firm!.id, archetype: "consultant" };
});

describe("stored notifications", () => {
  it("stores mentions, replies, to-dos, tasks and reviews and serves them in the inbox shape", async () => {
    const [post] = await db.insert(schema.chatMessages).values({ roomId, engagementId: caseId, userId: me.id, body: "Kickoff notes" }).returning();
    const [reply] = await db.insert(schema.chatMessages).values({ roomId, engagementId: caseId, userId: other.id, body: "Thanks", parentId: post!.id }).returning();
    const [mention] = await db.insert(schema.chatMessages).values({ roomId, engagementId: caseId, userId: other.id, body: "@Person 01 look", mentions: JSON.stringify([me.id]) }).returning();
    const [todo] = await db.insert(schema.todos).values({ engagementId: caseId, title: "Call OEM 07", assigneeId: me.id, createdBy: other.id }).returning();
    const [task] = await db.insert(schema.workplanTasks).values({ engagementId: caseId, moduleId, title: "Size the market", assigneeId: me.id, createdBy: other.id }).returning();
    const [review] = await db.insert(schema.workplanTasks).values({ engagementId: caseId, moduleId, title: "Check model", assigneeId: other.id, reviewerId: me.id, status: "almost_done" }).returning();

    const items = await inbox();
    const byId = new Map(items.map((i) => [i.id, i]));
    expect(byId.get(`m-${mention!.id}`)).toMatchObject({ kind: "mention", status: "unread", caseName: "Project Atlas", roomId, messageId: mention!.id, link: `/case/${caseId}/room/${roomId}` });
    expect(byId.get(`r-${reply!.id}`)).toMatchObject({ kind: "reply", threadId: post!.id, link: `/case/${caseId}/room/${roomId}?thread=${post!.id}` });
    expect(byId.get(`d-${todo!.id}`)).toMatchObject({ kind: "todo", todoId: todo!.id, body: "Person 02" });
    expect(byId.get(`t-${task!.id}`)).toMatchObject({ kind: "task", taskId: task!.id, body: "Market sizing" });
    expect(byId.get(`t-${review!.id}`)).toMatchObject({ kind: "review" });
    expect(items).toHaveLength(5);
    // Syncing again doesn't duplicate.
    expect(await inbox()).toHaveLength(5);
  });

  it("keeps the person's status and closes items whose source went away", async () => {
    const [task] = await db.select().from(schema.workplanTasks).where(eq(schema.workplanTasks.title, "Size the market"));
    await db.update(schema.notifications).set({ status: "read" }).where(eq(schema.notifications.key, `t-${task!.id}`));
    expect((await inbox()).find((i) => i.id === `t-${task!.id}`)?.status).toBe("read");

    await db.update(schema.workplanTasks).set({ status: "done" }).where(eq(schema.workplanTasks.id, task!.id));
    expect((await inbox()).some((i) => i.id === `t-${task!.id}`)).toBe(false);
    expect(await row(`t-${task!.id}`)).toMatchObject({ status: "done", doneBy: "system" });

    // Sent back: it needs the person again, so it reopens.
    await db.update(schema.workplanTasks).set({ status: "in_progress" }).where(eq(schema.workplanTasks.id, task!.id));
    expect((await inbox()).find((i) => i.id === `t-${task!.id}`)?.status).toBe("unread");
  });

  it("never reopens what the person closed, and hides snoozed items until their time", async () => {
    const [todo] = await db.select().from(schema.todos).where(eq(schema.todos.title, "Call OEM 07"));
    await db.update(schema.notifications).set({ status: "done", doneBy: "user" }).where(eq(schema.notifications.key, `d-${todo!.id}`));
    expect((await inbox()).some((i) => i.id === `d-${todo!.id}`)).toBe(false);

    const [review] = await db.select().from(schema.workplanTasks).where(eq(schema.workplanTasks.title, "Check model"));
    const key = `t-${review!.id}`;
    await db.update(schema.notifications).set({ status: "snoozed", snoozeUntil: new Date(Date.now() + 60_000) }).where(eq(schema.notifications.key, key));
    expect((await inbox()).some((i) => i.id === key)).toBe(false);
    await db.update(schema.notifications).set({ snoozeUntil: new Date(Date.now() - 1000) }).where(eq(schema.notifications.key, key));
    expect((await inbox()).some((i) => i.id === key)).toBe(true);
  });

  it("backfills everyone", async () => {
    expect(await syncAllNotifications(db)).toBe(2);
    const theirs = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, other.id));
    // Person 02's own task, still waiting on review, is the only thing for them.
    expect(theirs.map((n) => n.kind)).toEqual(["task"]);
  });
});
