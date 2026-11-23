import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { readSourceFile, saveSourceFile } from "@/lib/storage/files";
import { firstCopy } from "./dedupe";
import { loadCaseFolders } from "./folders";
import { KEEP_DELETED_DAYS, deleteFiles, filesInFolder, purgeDeleted, restoreFiles } from "./trash";

const dir = mkdtempSync(path.join(tmpdir(), "merqado-trash-"));
const db = drizzle(createClient({ url: `file:${path.join(dir, "t.db")}` }), { schema });
let firmId = "";
let engagementId = "";
let userId = "";
const all = () => true;

beforeAll(async () => {
  vi.stubEnv("LOCAL_STORAGE_DIR", path.join(dir, "uploads"));
  await migrate(db, { migrationsFolder: "./drizzle" });
  const [firm] = await db.insert(schema.firms).values({ name: "Test firm", slug: "test-firm" }).returning();
  const [user] = await db.insert(schema.users).values({ email: "a@test.example", name: "A" }).returning();
  const [eng] = await db.insert(schema.engagements).values({ firmId: firm!.id, clientName: "Client", title: "CASE001" }).returning();
  firmId = firm!.id;
  userId = user!.id;
  engagementId = eng!.id;
});

const save = (name: string, folder: string, values: Partial<typeof schema.sources.$inferInsert> = {}) =>
  saveSourceFile(db, { firmId, engagementId, file: new File([name], name, { type: "image/png" }), uploadedBy: userId, values: { folder, contentHash: `h-${name}`, ...values } });
const row = (id: string) => db.query.sources.findFirst({ where: eq(schema.sources.id, id) });

describe("deleting files", () => {
  it("deletes a whole version stack, hides it, and restores it", async () => {
    const v1 = await save("Model v1.png", "Models");
    const v2 = await save("Model v2.png", "Models", { versionOf: v1.id, version: 2 });
    const deleted = await deleteFiles(db, { firmId, engagementId, ids: [v2.id], canSee: all });
    expect(deleted?.sort()).toEqual([v1.id, v2.id].sort());
    expect((await row(v1.id))?.deletedAt).toBeInstanceOf(Date);
    expect(await filesInFolder(db, engagementId, "Models")).toEqual([]);
    // Re-uploading the same bytes isn't a duplicate of a deleted file.
    expect(await firstCopy(db, engagementId, "h-Model v1.png")).toBeUndefined();
    // Still opens while deleted.
    expect(new TextDecoder().decode(await readSourceFile(db, firmId, (await row(v1.id))!))).toBe("Model v1.png");

    const restored = await restoreFiles(db, { firmId, engagementId, ids: [v2.id], canSee: all });
    expect(restored.sort()).toEqual([v1.id, v2.id].sort());
    expect((await row(v2.id))?.deletedAt).toBeNull();
  });

  it("won't delete a file the person can't see, or a transcript's file", async () => {
    const hidden = await save("Private.png", "Working", { roomId: "room-1" });
    expect(await deleteFiles(db, { firmId, engagementId, ids: [hidden.id], canSee: (s) => !s.roomId })).toEqual([]);
    expect(await deleteFiles(db, { firmId, engagementId, ids: [hidden.id], canSee: (s) => !s.roomId, allOrNothing: true })).toBeNull();
    const [expert] = await db.insert(schema.experts).values({ engagementId, firstName: "X", company: "OEM 01", title: "VP" } as typeof schema.experts.$inferInsert).returning();
    const t = await save("Call.png", "Interviews");
    await db.insert(schema.expertTranscripts).values({ expertId: expert!.id, engagementId, filename: "Call.png", body: "x", sourceId: t.id } as typeof schema.expertTranscripts.$inferInsert);
    expect(await deleteFiles(db, { firmId, engagementId, ids: [t.id], canSee: all })).toEqual([]);
    expect((await row(t.id))?.deletedAt).toBeNull();
  });

  it("restores a deleted folder's files and the folder itself", async () => {
    const f = await save("Shot.png", "Research/Pictures");
    await deleteFiles(db, { firmId, engagementId, ids: [f.id], canSee: all });
    await db.delete(schema.caseFolders).where(eq(schema.caseFolders.path, "Research/Pictures"));
    expect(await loadCaseFolders(db, engagementId)).not.toContain("Research/Pictures");
    await restoreFiles(db, { firmId, engagementId, ids: [f.id], canSee: all, folders: ["Research/Pictures"] });
    expect(await loadCaseFolders(db, engagementId)).toContain("Research/Pictures");
  });

  it("purges files deleted long enough ago, and only those", async () => {
    const old = await save("Old.png", "Working");
    const fresh = await save("Fresh.png", "Working");
    const now = new Date();
    await deleteFiles(db, { firmId, engagementId, ids: [old.id], canSee: all, now: new Date(now.getTime() - (KEEP_DELETED_DAYS + 1) * 86_400_000) });
    await deleteFiles(db, { firmId, engagementId, ids: [fresh.id], canSee: all, now });
    const res = await purgeDeleted(db, now, async () => firmId);
    expect(res.failed).toBe(0);
    expect(await row(old.id)).toBeUndefined();
    expect(await db.query.sourceBlobs.findFirst({ where: eq(schema.sourceBlobs.sourceId, old.id) })).toBeUndefined();
    expect(await row(fresh.id)).toBeDefined();
  });
});
