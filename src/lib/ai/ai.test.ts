import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import type { DB } from "@/db/client";
import { aiProviderConfigSchema } from "./config";
import { completeAndMeter, type ResolvedProvider } from "./index";
import { costUsd } from "./pricing";
import { SpendCapError, assertUnderSpendCap, monthlySpendUsd } from "./spend";
import { modelForTier, tierForFeature } from "./tiers";
import type { CompletionRequest } from "./types";

describe("model tiers", () => {
  it("steps Claude connections down to Haiku and Sonnet", () => {
    const c = aiProviderConfigSchema.parse({ kind: "anthropic", apiKey: "k" });
    expect(modelForTier(c, "fast")).toBe("claude-haiku-5-5");
    expect(modelForTier(c, "standard")).toBe("claude-sonnet-5-5");
    expect(modelForTier(c, "deep")).toBe("claude-opus-5-5");
  });

  it("prefixes Bedrock model ids", () => {
    const c = aiProviderConfigSchema.parse({ kind: "bedrock", awsRegion: "us-east-1" });
    expect(modelForTier(c, "fast")).toBe("anthropic.claude-haiku-5-5");
    expect(modelForTier(c, "deep")).toBe("anthropic.claude-opus-5-5");
  });

  it("uses the one OpenAI model until tiers are named", () => {
    const c = aiProviderConfigSchema.parse({ kind: "openai", apiKey: "k", model: "m", tiers: { fast: "m-mini" } });
    expect(modelForTier(c, "fast")).toBe("m-mini");
    expect(modelForTier(c, "standard")).toBe("m");
    const az = aiProviderConfigSchema.parse({ kind: "azure-openai", apiKey: "k", endpoint: "https://x.openai.azure.com", deployment: "d" });
    expect(modelForTier(az, "deep")).toBe("d");
  });

  it("maps features to tiers", () => {
    expect(tierForFeature("file_filing")).toBe("fast");
    expect(tierForFeature("deck_generate")).toBe("deep");
    expect(tierForFeature("something_new")).toBe("standard");
  });
});

describe("pricing", () => {
  it("prices current Claude models and falls back conservatively", () => {
    expect(costUsd("claude-opus-5-5", 1_000_000, 1_000_000)).toBe(24);
    expect(costUsd("anthropic.claude-haiku-5-5", 1_000_000, 0)).toBe(0.1);
    expect(costUsd("claude-sonnet-5-5", 0, 1_000_000)).toBe(10);
    expect(costUsd("some-gpt", 1_000_000, 0)).toBe(4);
  });
});

describe("monthly spend cap", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ai-spend-"));
  const db = drizzle(createClient({ url: `file:${path.join(dir, "t.db")}` }), { schema }) as unknown as DB;
  let firmId = "";

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "./drizzle" });
    const [firm] = await db.insert(schema.firms).values({ name: "Test Firm", slug: "test-firm" }).returning();
    firmId = firm!.id;
  });

  afterEach(() => vi.unstubAllEnvs());

  const event = (model: string, inputTokens: number, outputTokens: number, createdAt?: Date) =>
    db.insert(schema.usageEvents).values({
      firmId,
      billingMode: "managed",
      providerKind: "anthropic",
      model,
      inputTokens,
      outputTokens,
      feature: "ask",
      ...(createdAt ? { createdAt } : {}),
    });

  it("sums this month's usage and ignores last month", async () => {
    const now = new Date();
    await event("claude-opus-5-5", 1_000_000, 0);
    await event("claude-opus-5-5", 1_000_000, 0, new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15)));
    expect(await monthlySpendUsd(db, firmId)).toBeCloseTo(4);
  });

  it("allows calls with no cap, blocks at the firm cap", async () => {
    await expect(assertUnderSpendCap(db, firmId)).resolves.toBeUndefined();
    await db.update(schema.firms).set({ aiMonthlyCapUsd: 3 }).where(eq(schema.firms.id, firmId));
    await expect(assertUnderSpendCap(db, firmId)).rejects.toBeInstanceOf(SpendCapError);
    await db.update(schema.firms).set({ aiMonthlyCapUsd: 10 }).where(eq(schema.firms.id, firmId));
    await expect(assertUnderSpendCap(db, firmId)).resolves.toBeUndefined();
  });

  it("uses the managed default cap when the firm has none", async () => {
    await db.update(schema.firms).set({ aiMonthlyCapUsd: null }).where(eq(schema.firms.id, firmId));
    vi.stubEnv("MANAGED_AI_MONTHLY_CAP_USD", "2");
    await expect(assertUnderSpendCap(db, firmId)).rejects.toBeInstanceOf(SpendCapError);
  });

  it("checks the cap before calling the model and passes the feature's tier", async () => {
    const complete = vi.fn(async (req: CompletionRequest) => ({
      text: "ok",
      model: req.tier === "fast" ? "claude-haiku-5-5" : "claude-opus-5-5",
      usage: { inputTokens: 10, outputTokens: 10 },
      refused: false,
    }));
    const resolved: ResolvedProvider = { provider: { kind: "anthropic", complete }, providerId: null, billingMode: "managed" };
    const req = { messages: [{ role: "user" as const, content: "hi" }] };

    await db.update(schema.firms).set({ aiMonthlyCapUsd: 1 }).where(eq(schema.firms.id, firmId));
    await expect(completeAndMeter(db, resolved, req, { firmId, feature: "file_filing" })).rejects.toBeInstanceOf(SpendCapError);
    expect(complete).not.toHaveBeenCalled();

    await db.update(schema.firms).set({ aiMonthlyCapUsd: 100 }).where(eq(schema.firms.id, firmId));
    const result = await completeAndMeter(db, resolved, req, { firmId, feature: "file_filing" });
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ tier: "fast" }));
    expect(result.model).toBe("claude-haiku-5-5");
  });
});
