import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import type { DB } from "@/db/client";
import { ensurePracticeUser, isPracticeCode, practiceLoginEnabled } from "./practice";

async function freshDb(): Promise<DB> {
  const dir = mkdtempSync(join(tmpdir(), "practice-"));
  const db = drizzle(createClient({ url: `file:${join(dir, "t.db")}` }), { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

describe("practice sign-in", () => {
  it("is on unless switched off", () => {
    expect(practiceLoginEnabled({})).toBe(true);
    expect(practiceLoginEnabled({ PRACTICE_LOGIN_ENABLED: "true" })).toBe(true);
    for (const off of ["false", "0", "off", "No"]) expect(practiceLoginEnabled({ PRACTICE_LOGIN_ENABLED: off })).toBe(false);
    expect(isPracticeCode(" XXXX ", {})).toBe(true);
    expect(isPracticeCode("xxxx", { PRACTICE_LOGIN_ENABLED: "false" })).toBe(false);
    expect(isPracticeCode("xxxx@guava.ventures", {})).toBe(false);
  });

  it("lands in its own firm as partner and admin, without other firms' cases", async () => {
    const db = await freshDb();
    const [other] = await db.insert(schema.firms).values({ name: "Other", slug: "other" }).returning();
    await db.insert(schema.engagements).values({ firmId: other!.id, clientName: "Client", title: "Project Atlas" });

    const first = await ensurePracticeUser(db);
    const again = await ensurePracticeUser(db);
    expect(again).toEqual(first);
    expect(first.firmId).not.toBe(other!.id);

    const member = await db.query.firmMembers.findFirst({ where: eq(schema.firmMembers.userId, first.userId) });
    const role = await db.query.firmRoles.findFirst({ where: eq(schema.firmRoles.id, member!.firmRoleId) });
    expect(member!.isAdmin).toBe(true);
    expect(role!.archetype).toBe("partner");

    const memberships = await db.query.engagementMembers.findMany({ where: eq(schema.engagementMembers.userId, first.userId) });
    expect(memberships).toHaveLength(1);
    const eng = await db.query.engagements.findFirst({ where: eq(schema.engagements.id, memberships[0]!.engagementId) });
    expect(eng!.firmId).toBe(first.firmId);
    expect(await db.query.firmMembers.findMany({ where: eq(schema.firmMembers.firmId, other!.id) })).toHaveLength(0);
  });
});
