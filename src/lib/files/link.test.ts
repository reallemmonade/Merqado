import { describe, expect, it, vi } from "vitest";
import { deleteSourceBytes, isLinked, linkKey, placeSourceFile, restoreSourceBytes, trashSourceBytes } from "@/lib/storage/files";
import { driveFileIdFromLink } from "@/lib/storage/providers/gdrive";
import { isMicrosoftLink } from "./link";

const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz_-123";

describe("Drive links", () => {
  it("finds the file id in Drive, Docs, Sheets and Slides links", () => {
    expect(driveFileIdFromLink(`https://drive.google.com/file/d/${ID}/view?usp=sharing`)).toBe(ID);
    expect(driveFileIdFromLink(`https://docs.google.com/document/d/${ID}/edit`)).toBe(ID);
    expect(driveFileIdFromLink(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`)).toBe(ID);
    expect(driveFileIdFromLink(`https://docs.google.com/presentation/d/${ID}/edit`)).toBe(ID);
    expect(driveFileIdFromLink(`https://drive.google.com/open?id=${ID}`)).toBe(ID);
  });

  it("rejects folders, other sites and look-alike hosts", () => {
    expect(driveFileIdFromLink(`https://drive.google.com/drive/folders/${ID}`)).toBeNull();
    expect(driveFileIdFromLink(`https://example.com/file/d/${ID}/view`)).toBeNull();
    expect(driveFileIdFromLink(`https://drive.google.com.evil.example/file/d/${ID}/view`)).toBeNull();
    expect(driveFileIdFromLink("not a link")).toBeNull();
  });

  it("spots OneDrive and SharePoint links", () => {
    expect(isMicrosoftLink("https://1drv.ms/w/s!abc")).toBe(true);
    expect(isMicrosoftLink("https://firm.sharepoint.com/:w:/r/sites/x/doc.docx")).toBe(true);
    expect(isMicrosoftLink(`https://drive.google.com/file/d/${ID}/view`)).toBe(false);
  });
});

describe("linked files in storage", () => {
  const linked = { id: "s1", objectKey: linkKey("gdrive", ID), storageConnectionId: "conn", filename: "Model.xlsx" };
  // Any storage call would need a database; a link must never reach one.
  const db = new Proxy({}, { get: () => vi.fn(() => { throw new Error("storage touched"); }) }) as never;

  it("never moves, trashes, restores or deletes the original", async () => {
    expect(isLinked(linked)).toBe(true);
    expect(await placeSourceFile(db, "firm", linked, ["Case", "Models"])).toBe(linked.objectKey);
    await expect(trashSourceBytes(db, "firm", linked)).resolves.toBeUndefined();
    await expect(restoreSourceBytes(db, "firm", linked)).resolves.toBeUndefined();
    await expect(deleteSourceBytes(db, "firm", linked)).resolves.toBeUndefined();
  });
});

describe("refreshing linked files", () => {
  it("re-reads an edited original and leaves an unchanged one alone", async () => {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const { randomBytes } = await import("node:crypto");
    const { createClient } = await import("@libsql/client");
    const { drizzle } = await import("drizzle-orm/libsql");
    const { migrate } = await import("drizzle-orm/libsql/migrator");
    const { eq } = await import("drizzle-orm");
    const schema = await import("@/db/schema");
    const { encryptJson } = await import("@/lib/crypto");
    const { GDriveStorage } = await import("@/lib/storage/providers/gdrive");
    const { refreshLinkedFiles } = await import("./link");

    process.env.MERQADO_SECRET_KEY = randomBytes(32).toString("base64");
    const dir = mkdtempSync(path.join(tmpdir(), "merqado-link-"));
    const db = drizzle(createClient({ url: `file:${path.join(dir, "t.db")}` }), { schema });
    await migrate(db, { migrationsFolder: "./drizzle" });
    const [firm] = await db.insert(schema.firms).values({ name: "Test firm", slug: "test-firm" }).returning();
    const [conn] = await db
      .insert(schema.storageConnections)
      .values({ firmId: firm!.id, label: "Drive", kind: "gdrive", isDefault: true, encryptedConfig: encryptJson({ kind: "gdrive", refreshToken: "r", rootFolderId: "root0000000" }) })
      .returning();
    const [eng] = await db.insert(schema.engagements).values({ firmId: firm!.id, clientName: "Client", title: "Project Atlas" }).returning();
    const base = { engagementId: eng!.id, storageConnectionId: conn!.id, originKind: "gdrive" as const, filing: "filed" as const, mimeType: "text/plain" };
    const [edited] = await db
      .insert(schema.sources)
      .values({ ...base, objectKey: linkKey("gdrive", "edited00000"), filename: "Notes.txt", originRef: "edited00000", originVersion: "2026-11-01T00:00:00Z", textBody: "old", termsScannedAt: new Date() })
      .returning();
    const [same] = await db
      .insert(schema.sources)
      .values({ ...base, objectKey: linkKey("gdrive", "same0000000"), filename: "Plan.txt", originRef: "same0000000", originVersion: "2026-11-01T00:00:00Z", textBody: "plan" })
      .returning();

    const meta = vi.spyOn(GDriveStorage.prototype, "meta").mockImplementation(async (id: string) => ({
      id,
      name: id === "edited00000" ? "Notes v2.txt" : "Plan.txt",
      mimeType: "text/plain",
      modifiedTime: id === "edited00000" ? "2026-11-20T00:00:00Z" : "2026-11-01T00:00:00Z",
    }));
    const read = vi.spyOn(GDriveStorage.prototype, "readLinked").mockImplementation(async (f) => ({ bytes: new TextEncoder().encode("OEM 18 grew 12%"), filename: f.name }));

    const now = new Date("2026-11-27T00:00:00Z");
    expect(await refreshLinkedFiles(db, now)).toEqual({ checked: 2, updated: 1, failed: 0 });
    const after = await db.query.sources.findFirst({ where: eq(schema.sources.id, edited!.id) });
    expect(after).toMatchObject({ textBody: "OEM 18 grew 12%", filename: "Notes v2.txt", originVersion: "2026-11-20T00:00:00Z", termsScannedAt: null });
    const kept = await db.query.sources.findFirst({ where: eq(schema.sources.id, same!.id) });
    expect(kept?.textBody).toBe("plan");
    expect(kept?.originCheckedAt?.getTime()).toBe(now.getTime());
    expect(read).toHaveBeenCalledTimes(1);
    meta.mockRestore();
    read.mockRestore();
  });
});
