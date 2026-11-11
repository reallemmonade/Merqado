import { and, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { aiProviders, firms, usageEvents, type BillingMode } from "@/db/schema";
import { decryptJson } from "@/lib/crypto";
import { aiProviderConfigSchema, type AIProviderConfig } from "./config";
import { AnthropicFamilyProvider } from "./providers/anthropic";
import { OpenAIFamilyProvider } from "./providers/openai";
import { assertUnderSpendCap } from "./spend";
import { tierForFeature } from "./tiers";
import type { AIProvider, CompletionRequest, CompletionResult } from "./types";

export * from "./types";
export { aiProviderConfigSchema, type AIProviderConfig } from "./config";
export { AI_TIERS, FEATURE_TIERS, modelForTier, tierForFeature, type AITier } from "./tiers";
export { SpendCapError, assertUnderSpendCap, monthlySpendUsd } from "./spend";
export { costUsd } from "./pricing";

export function createProvider(config: AIProviderConfig): AIProvider {
  switch (config.kind) {
    case "anthropic":
    case "bedrock":
    case "vertex":
      return new AnthropicFamilyProvider(config);
    case "openai":
    case "azure-openai":
      return new OpenAIFamilyProvider(config);
  }
}

export interface ResolvedProvider {
  provider: AIProvider;
  providerId: string | null;
  billingMode: BillingMode;
}

/**
 * Picks the model connection for a call: the engagement's override, else the firm's default.
 * In "managed" mode with no firm connection, falls back to Merqado's own Anthropic key.
 */
export async function resolveProvider(
  db: DB,
  firmId: string,
  engagementProviderId?: string | null,
): Promise<ResolvedProvider> {
  const firm = await db.query.firms.findFirst({ where: eq(firms.id, firmId) });
  if (!firm) throw new Error(`Firm ${firmId} not found`);

  const row = engagementProviderId
    ? await db.query.aiProviders.findFirst({
        where: and(eq(aiProviders.id, engagementProviderId), eq(aiProviders.firmId, firmId)),
      })
    : await db.query.aiProviders.findFirst({
        where: and(eq(aiProviders.firmId, firmId), eq(aiProviders.isDefault, true)),
      });

  if (row) {
    const config = aiProviderConfigSchema.parse(decryptJson(row.encryptedConfig));
    return { provider: createProvider(config), providerId: row.id, billingMode: firm.aiBillingMode };
  }

  if (firm.aiBillingMode === "byo") {
    throw new Error("This firm uses its own AI account but has not connected one yet.");
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set for managed AI.");
  return {
    provider: createProvider({ kind: "anthropic", apiKey, model: "claude-opus-5-5" }),
    providerId: null,
    billingMode: "managed",
  };
}

/**
 * Runs a completion and records a usage row, whoever pays for it.
 * Checks the firm's monthly spend cap first; the tier comes from the feature unless the request sets one.
 */
export async function completeAndMeter(
  db: DB,
  resolved: ResolvedProvider,
  req: CompletionRequest,
  ctx: { firmId: string; engagementId?: string; userId?: string; feature: string },
): Promise<CompletionResult> {
  await assertUnderSpendCap(db, ctx.firmId);
  const result = await resolved.provider.complete({ ...req, tier: req.tier ?? tierForFeature(ctx.feature) });
  await db.insert(usageEvents).values({
    firmId: ctx.firmId,
    engagementId: ctx.engagementId,
    userId: ctx.userId,
    aiProviderId: resolved.providerId,
    billingMode: resolved.billingMode,
    providerKind: resolved.provider.kind,
    model: result.model,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    feature: ctx.feature,
  });
  return result;
}
