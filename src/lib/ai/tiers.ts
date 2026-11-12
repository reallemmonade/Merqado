import type { AIProviderConfig } from "./config";

export const AI_TIERS = ["fast", "standard", "deep"] as const;
export type AITier = (typeof AI_TIERS)[number];

/** Which tier each AI feature runs on. Features not listed run on "standard". */
export const FEATURE_TIERS: Record<string, AITier> = {
  file_filing: "fast",
  todo_scan: "fast",
  dictionary_suggest: "fast",
  ask: "standard",
  case_gpt: "standard",
  transcript_clean: "standard",
  expert_guide: "standard",
  expert_takeaways: "standard",
  deck_qc: "standard",
  deck_contradictions: "standard",
  deck_generate: "deep",
  deck_redo: "deep",
};

export function tierForFeature(feature: string): AITier {
  return FEATURE_TIERS[feature] ?? "standard";
}

/** The connection's own model (or Azure deployment). Used for "deep" unless overridden. */
export function baseModel(config: AIProviderConfig): string {
  return config.kind === "azure-openai" ? config.deployment : config.model;
}

const CLAUDE_TIER_DEFAULTS: Record<Exclude<AITier, "deep">, string> = {
  fast: "claude-haiku-5-5",
  standard: "claude-sonnet-5-5",
};

/**
 * Model for a tier: the connection's explicit tier override, else a default.
 * Claude connections step down to Haiku / Sonnet; OpenAI-family connections use their one model
 * until the firm names per-tier models.
 */
export function modelForTier(config: AIProviderConfig, tier: AITier): string {
  const override = config.tiers?.[tier];
  if (override) return override;
  if (tier === "deep") return baseModel(config);
  switch (config.kind) {
    case "anthropic":
    case "vertex":
      return CLAUDE_TIER_DEFAULTS[tier];
    case "bedrock":
      return `anthropic.${CLAUDE_TIER_DEFAULTS[tier]}`;
    case "openai":
    case "azure-openai":
      return baseModel(config);
  }
}
