import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { fileResponse, readSourceFile, saveSourceFile } from "./files";

const dir = mkdtempSync(path.join(tmpdir(), "merqado-files-"));
const db = drizzle(createClient({ url: `file:${path.join(dir, "t.db")}` }), { schema });
let firmId = "";
let engagementId = "";
let userId = "";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  const [firm] = await db.insert(schema.firms).values({ name: "Test firm", slug: "test-firm" }).returning();
  const [user] = await db.insert(schema.users).values({ email: "a@test.example", name: "A" }).returning();
  const [eng] = await db
    .insert(schema.engagements)
    .values({ firmId: firm!.id, clientName: "X", title: "Y" })
    .returning();
  firmId = firm!.id;
  userId = user!.id;
  engagementId = eng!.id;
});

afterEach(() => vi.unstubAllEnvs());

describe("source files", () => {
  it("keeps the original in the database when no storage is connected", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const original = "[00:00] Interviewer: hello\n\n[00:05] Expert: hi";
    const file = new File([original], "Call 1.txt", { type: "text/plain" });
    const source = await saveSourceFile(db, { firmId, engagementId, file, uploadedBy: userId });
    expect(source.objectKey.startsWith("db:")).toBe(true);
    const bytes = await readSourceFile(db, firmId, source);
    expect(new TextDecoder().decode(bytes)).toBe(original);
  });

  it("opens text and PDFs in the browser and downloads Word files", async () => {
    const txt = fileResponse(new TextEncoder().encode("hi"), "Call 1.txt", "text/plain");
    expect(txt.headers.get("content-disposition")).toMatch(/^inline; filename="Call 1.txt"/);
    expect(txt.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await txt.text()).toBe("hi");

    const docx = fileResponse(new Uint8Array([1, 2]), "Café call.docx", null);
    expect(docx.headers.get("content-disposition")).toMatch(/^attachment; filename="Caf_ call.docx"; filename\*=UTF-8''Caf%C3%A9%20call.docx/);

    const html = fileResponse(new TextEncoder().encode("<script>"), "x.html", "text/html");
    expect(html.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(html.headers.get("content-security-policy")).toContain("sandbox");
  });
});
