import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import type { DB } from "@/db/client";
import { blockedNames, packTexts, pickNewTerms, rescanCaseFiles, scanFileForTerms, termKeys, type Complete } from "./dictionary";

describe("term matching", () => {
  it("matches a term by its full name or its acronym", () => {
    expect(termKeys("Statement of Work (SOW)")).toEqual(["statement of work sow", "statement of work", "sow"]);
    expect(termKeys("  CDMO ")).toEqual(["cdmo"]);
  });

  it("keeps only new, defined terms that don't name the client", () => {
    const reply = {
      terms: [
        { term: "Statement of Work (SOW)", category: "legal", definition: "The contract that sets scope and fees." },
        { term: "SOW", category: "Acronym", definition: "Statement of work." },
        { term: "CDMO", category: "Acronym", definition: "Contract maker." },
        { term: "Company 07", category: "Company", definition: "The client." },
        { term: "Run-rate", category: "Finance", definition: "Revenue at Company 07's current pace." },
        { term: "Extrusion", category: "Odd", definition: "Shaping material through a die." },
        { term: "Blank", definition: "" },
      ],
    };
    expect(pickNewTerms(reply, ["cdmo"], blockedNames({ clientName: "Company 07" }))).toEqual([
      { term: "Statement of Work (SOW)", category: "Legal", definition: "The contract that sets scope and fees." },
      { term: "Extrusion", category: "Industry", definition: "Shaping material through a die." },
    ]);
    expect(pickNewTerms("nonsense", [], [])).toEqual([]);
    expect(blockedNames({ clientName: "Client" })).toEqual([]);
  });
});

describe("packTexts", () => {
  it("fills parts without splitting a file, and trims long files", () => {
    const parts = packTexts(
      [
        { name: "a", text: "x".repeat(50) },
        { name: "b", text: "y".repeat(50) },
        { name: "c", text: "z".repeat(500) },
      ],
      100,
      140,
    );
    expect(parts).toHaveLength(2);
    expect(parts[0]).toContain("### a");
    expect(parts[0]).toContain("### b");
    expect(parts[1]).toBe(`### c\n${"z".repeat(100)}\n\n`);
  });
});

describe("scanFileForTerms", () => {
  let db: DB;
  let engagementId: string;
  beforeEach(async () => {
    const dir = mkdtempSync(join(tmpdir(), "mq-dict-"));
    db = drizzle(createClient({ url: `file:${join(dir, "t.db")}` }), { schema });
    await migrate(db, { migrationsFolder: "./drizzle" });
    const [firm] = await db.insert(schema.firms).values({ name: "Firm", slug: "firm" }).returning();
    const [eng] = await db.insert(schema.engagements).values({ firmId: firm!.id, clientName: "Client", title: "Project Atlas" }).returning();
    engagementId = eng!.id;
    await db.insert(schema.glossaryTerms).values({ engagementId, term: "CDMO", definition: "Contract maker." });
  });

  const addFile = async (values: Partial<typeof schema.sources.$inferInsert> = {}) => {
    const [s] = await db
      .insert(schema.sources)
      .values({ engagementId, objectKey: "k", filename: "SOW.docx", textBody: "This SOW covers CDMO work and MSA terms.", ...values })
      .returning();
    return s!.id;
  };

  const model = (terms: unknown[]): Complete & { calls: number } => {
    const fn = Object.assign(
      async () => {
        fn.calls++;
        return JSON.stringify({ terms });
      },
      { calls: 0 },
    );
    return fn;
  };

  it("adds new terms once, and reads each file only once", async () => {
    const id = await addFile();
    const ai = model([
      { term: "Master Services Agreement (MSA)", category: "Legal", definition: "The umbrella contract." },
      { term: "CDMO", category: "Acronym", definition: "Again." },
    ]);
    expect(await scanFileForTerms(db, id, ai)).toEqual({ added: 1 });
    expect(await scanFileForTerms(db, id, ai)).toEqual({ added: 0 });
    expect(ai.calls).toBe(1);
    const terms = await db.select().from(schema.glossaryTerms).where(eq(schema.glossaryTerms.engagementId, engagementId));
    expect(terms.map((t) => [t.term, t.status])).toEqual([
      ["CDMO", "active"],
      ["Master Services Agreement (MSA)", "active"],
    ]);
  });

  it("skips files from private chats and files without text", async () => {
    const [room] = await db.insert(schema.chatRooms).values({ engagementId, name: "Core" }).returning();
    const ai = model([{ term: "MSA", definition: "Contract." }]);
    expect(await scanFileForTerms(db, await addFile({ roomId: room!.id }), ai)).toEqual({ added: 0 });
    expect(await scanFileForTerms(db, await addFile({ textBody: null }), ai)).toEqual({ added: 0 });
    expect(ai.calls).toBe(0);
  });

  it("lets the scheduler retry when the model fails", async () => {
    const id = await addFile();
    const failing: Complete = async () => {
      throw new Error("down");
    };
    await expect(scanFileForTerms(db, id, failing)).rejects.toThrow("down");
    const [row] = await db.select().from(schema.sources).where(eq(schema.sources.id, id));
    expect(row!.termsScannedAt).toBeNull();
    expect(await scanFileForTerms(db, id, model([{ term: "MSA", definition: "Contract." }]))).toEqual({ added: 1 });
  });

  it("re-reads every case file on Scan files, already-scanned ones too", async () => {
    const id = await addFile({ termsScannedAt: new Date() });
    await addFile({ filename: "Plan.docx", textBody: "Uses a TAM build." });
    const [room] = await db.insert(schema.chatRooms).values({ engagementId, name: "Core" }).returning();
    await addFile({ roomId: room!.id, textBody: "Secret word." });
    const seen: string[] = [];
    const ai: Complete = async (req) => {
      seen.push(req.messages[0]!.content);
      return JSON.stringify({ terms: [{ term: "Total Addressable Market (TAM)", category: "Finance", definition: "All possible demand." }, { term: "CDMO", definition: "Again." }] });
    };
    const eng = (await db.query.engagements.findFirst({ where: eq(schema.engagements.id, engagementId) }))!;
    expect(await rescanCaseFiles(db, eng, ai)).toEqual({ files: 2, added: 1 });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain("SOW.docx");
    expect(seen[0]).not.toContain("Secret word");
    expect(await scanFileForTerms(db, id, ai)).toEqual({ added: 0 });
  });
});
