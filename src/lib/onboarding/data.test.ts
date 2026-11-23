import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import type { DB } from "@/db/client";
import { loadOnboarding, saveFirmStandard, saveOnboarding } from "./data";
import { DEFAULT_STANDARD, emptyOnboarding } from "./model";

const dir = mkdtempSync(path.join(tmpdir(), "merqado-onboarding-"));
const db = drizzle(createClient({ url: `file:${path.join(dir, "t.db")}` }), { schema }) as unknown as DB;
let eng: typeof schema.engagements.$inferSelect;
let userId: string;

beforeAll(async () => {
  await migrate(db as never, { migrationsFolder: "./drizzle" });
  const [firm] = await db.insert(schema.firms).values({ name: "Test firm", slug: "test-firm" }).returning();
  const [user] = await db.insert(schema.users).values({ email: "a@test.example", name: "Person 01", timeZone: "America/New_York" }).returning();
  [eng] = await db.insert(schema.engagements).values({ firmId: firm!.id, clientName: "Project Birch", title: "Market study" }).returning();
  userId = user!.id;
  await db.insert(schema.engagementMembers).values({ engagementId: eng!.id, userId });
  await db.insert(schema.expertTypes).values({ engagementId: eng!.id, name: "Customers", target: 5 });
});

const members = () => [{ id: userId, name: "Person 01", archetype: "consultant" as const, caseRole: null, firmArchetype: "consultant" as const, title: "Consultant" }];

describe("onboarding data", () => {
  it("starts with the case team and the built-in standard", async () => {
    const s = await loadOnboarding(db, eng, members());
    expect(s.data.started).toBe(false);
    expect(s.data.team).toEqual([expect.objectContaining({ name: "Person 01", email: "a@test.example", tz: "ET", lead: true, copy: "all" })]);
    expect(s.firmStandard).toEqual(DEFAULT_STANDARD);
  });

  it("saves, and copies dates to the case and angles to Experts", async () => {
    const data = {
      ...emptyOnboarding(),
      started: true,
      startsOn: "12/1",
      endsOn: "1/15",
      angles: [
        { id: "a1", name: "customers", n: "~15", who: "", companies: "", roles: "", screeners: "" },
        { id: "a2", name: "Competitors", n: "10", who: "", companies: "", roles: "", screeners: "" },
      ],
    };
    await saveOnboarding(db, eng.id, userId, "CASE002", data);
    await saveOnboarding(db, eng.id, userId, "CASE002", data);
    const s = await loadOnboarding(db, eng, members());
    expect(s.caseCode).toBe("CASE002");
    expect(s.data.angles).toHaveLength(2);
    const types = await db.select().from(schema.expertTypes).where(eq(schema.expertTypes.engagementId, eng.id));
    expect(types.map((t) => [t.name, t.target]).sort()).toEqual([
      ["Competitors", 10],
      ["Customers", 15],
    ]);
    const e = await db.query.engagements.findFirst({ where: eq(schema.engagements.id, eng.id) });
    expect([e?.startsOn, e?.endsOn]).toEqual(["12/1", "1/15"]);
  });

  it("keeps one firm standard for every case", async () => {
    await saveFirmStandard(db, eng.firmId, { ...DEFAULT_STANDARD, networks: [{ name: "Network 01", email: "n1@example.com" }] });
    const s = await loadOnboarding(db, eng, members());
    expect(s.firmStandard.networks).toEqual([{ name: "Network 01", email: "n1@example.com" }]);
  });
});
