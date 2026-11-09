import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { eq } from "drizzle-orm";
import JSZip from "jszip";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import type { Authorized } from "@/lib/experts/api";
import { removeWaitingDuplicates } from "./dedupe";
import { extractText } from "./extract";
import { loadCaseFolders } from "./folders";
import { fileSources, intakeFile } from "./intake";

const dir = mkdtempSync(path.join(tmpdir(), "merqado-intake-"));
const db = drizzle(createClient({ url: `file:${path.join(dir, "t.db")}` }), { schema });
let auth: Authorized;

beforeAll(async () => {
  vi.stubEnv("LOCAL_STORAGE_DIR", path.join(dir, "uploads"));
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  await migrate(db, { migrationsFolder: "./drizzle" });
  const [firm] = await db.insert(schema.firms).values({ name: "Test firm", slug: "test-firm" }).returning();
  const [user] = await db.insert(schema.users).values({ email: "a@test.example", name: "A" }).returning();
  const [eng] = await db.insert(schema.engagements).values({ firmId: firm!.id, clientName: "Project Atlas", title: "Market study" }).returning();
  await db.insert(schema.experts).values({ engagementId: eng!.id, firstName: "X", company: "OEM 16", title: "Head of sourcing" } as typeof schema.experts.$inferInsert);
  auth = {
    db: db as unknown as Authorized["db"],
    user: { id: user!.id, firmId: firm!.id, email: user!.email, name: "A", title: "Partner", archetype: "partner", isAdmin: true } as Authorized["user"],
    engagement: eng!,
    membership: { engagement: eng!, access: "lead", role: "partner" },
  };
});

const file = (name: string, text: string) => new File([text], name, { type: "text/plain" });

describe("intake", () => {
  it("seeds the default folders", async () => {
    const f = await loadCaseFolders(auth.db, auth.engagement.id);
    expect(f).toContain("Interviews/Transcripts");
    expect(f.indexOf("Admin/Expenses")).toBeGreaterThan(f.indexOf("Admin"));
  });

  it("waits for a confirm, with a suggestion, a link and the file's text", async () => {
    const r = await intakeFile(auth, { file: file("Person 21, OEM 16 transcript.txt", "Interviewer: hi\nExpert: hello"), batchId: "b1" });
    expect(r.duplicate).toBe(false);
    expect(r.source.filing).toBe("pending");
    expect(JSON.parse(r.source.suggestions)[0]).toBe("Interviews/Transcripts");
    expect(JSON.parse(r.source.links)[0].label).toMatch(/OEM 16|Head/);
    expect(r.duplicate ? null : r.source.textBody).toContain("Expert: hello");

    await fileSources(auth, [{ sourceId: r.source.id, folder: "Interviews/Transcripts" }]);
    const row = await db.query.sources.findFirst({ where: eq(schema.sources.id, r.source.id) });
    expect(row?.filing).toBe("filed");
    expect(row?.folder).toBe("Interviews/Transcripts");
  });

  it("skips an exact duplicate", async () => {
    const r = await intakeFile(auth, { file: file("copy of it.txt", "Interviewer: hi\nExpert: hello") });
    expect(r.duplicate).toBe(true);
  });

  it("keeps one copy when the same file is uploaded twice at once", async () => {
    const [a, b] = await Promise.all([intakeFile(auth, { file: file("twin a.txt", "same bytes") }), intakeFile(auth, { file: file("twin b.txt", "same bytes") })]);
    expect([a.duplicate, b.duplicate].sort()).toEqual([false, true]);
    expect(a.source.id).toBe(b.source.id);
  });

  it("clears extra waiting copies already saved", async () => {
    const r = await intakeFile(auth, { file: file("solo.txt", "solo bytes") });
    const { id: _id, ...rest } = (await db.query.sources.findFirst({ where: eq(schema.sources.id, r.source.id) }))!;
    await db.insert(schema.sources).values({ ...rest, objectKey: `db:${crypto.randomUUID()}` });
    expect(await removeWaitingDuplicates(auth.db, auth.engagement.id)).toBe(1);
    const left = await db.select().from(schema.sources).where(eq(schema.sources.contentHash, rest.contentHash!));
    expect(left.map((x) => x.id)).toEqual([r.source.id]);
  });

  it("stacks a newer copy as the next version", async () => {
    const a = await intakeFile(auth, { file: file("Market Model v1.csv", "a,b\n1,2") });
    await fileSources(auth, [{ sourceId: a.source.id, folder: "Models" }]);
    const b = await intakeFile(auth, { file: file("Market Model v2.csv", "a,b\n1,3") });
    expect(b.source.versionCandidate).toBe(a.source.id);
    expect(JSON.parse(b.source.suggestions)[0]).toBe("Models");
    await fileSources(auth, [{ sourceId: b.source.id, folder: "Models", asVersion: true }]);
    const row = await db.query.sources.findFirst({ where: eq(schema.sources.id, b.source.id) });
    expect(row?.versionOf).toBe(a.source.id);
    expect(row?.version).toBe(2);
  });

  it("adds a new folder when a file is filed into one", async () => {
    const r = await intakeFile(auth, { file: file("notes.txt", "misc") });
    await fileSources(auth, [{ sourceId: r.source.id, folder: "Working/A" }]);
    expect(await loadCaseFolders(auth.db, auth.engagement.id)).toContain("Working/A");
  });
});

describe("extractText", () => {
  it("reads spreadsheets and slides", async () => {
    const x = new JSZip();
    x.file("xl/workbook.xml", '<workbook><sheets><sheet name="Sizing" sheetId="1"/></sheets></workbook>');
    x.file("xl/sharedStrings.xml", "<sst><si><t>Market</t></si><si><t>Tubing</t></si></sst>");
    x.file("xl/worksheets/sheet1.xml", '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>42</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c></row></sheetData></worksheet>');
    const xlsx = await extractText("m.xlsx", await x.generateAsync({ type: "uint8array" }));
    expect(xlsx).toContain("## Sizing");
    expect(xlsx).toContain("Market\t42");
    expect(xlsx).toContain("Tubing");

    const p = new JSZip();
    p.file("ppt/slides/slide1.xml", "<p:sld><a:p><a:r><a:t>Market grows 5%</a:t></a:r></a:p></p:sld>");
    expect(await extractText("d.pptx", await p.generateAsync({ type: "uint8array" }))).toContain("Market grows 5%");
  });

  it("returns nothing for files it can't read", async () => {
    expect(await extractText("x.pdf", new Uint8Array([1, 2, 3]))).toBe("");
  });
});
