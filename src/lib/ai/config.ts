import { z } from "zod";

/** Optional per-tier model (or Azure deployment) names; unset tiers use defaults. */
const tierModels = z
  .object({ fast: z.string().min(1), standard: z.string().min(1), deep: z.string().min(1) })
  .partial()
  .optional();

/**
 * Connection settings a firm saves for its model. Stored encrypted.
 * Anthropic-family kinds use the Anthropic SDK; OpenAI-family kinds use the OpenAI SDK.
 */
export const aiProviderConfigSchema = z.discriminatedUnion("kind", [
  z.object({
    tiers: tierModels,
    kind: z.literal("anthropic"),
    apiKey: z.string().min(1),
    model: z.string().default("claude-opus-5-5"),
  }),
  z.object({
    tiers: tierModels,
    kind: z.literal("bedrock"),
    awsRegion: z.string().min(1),
    awsAccessKey: z.string().optional(),
    awsSecretAccessKey: z.string().optional(),
    model: z.string().default("anthropic.claude-opus-5-5"),
  }),
  z.object({
    tiers: tierModels,
    kind: z.literal("vertex"),
    projectId: z.string().min(1),
    region: z.string().default("global"),
    model: z.string().default("claude-opus-5-5"),
  }),
  z.object({
    tiers: tierModels,
    kind: z.literal("openai"),
    apiKey: z.string().min(1),
    model: z.string().min(1),
    /** Set for any OpenAI-compatible gateway (vLLM, a firm's internal proxy, etc.). */
    baseURL: z.url().optional(),
  }),
  z.object({
    tiers: tierModels,
    kind: z.literal("azure-openai"),
    apiKey: z.string().min(1),
    endpoint: z.url(),
    deployment: z.string().min(1),
    apiVersion: z.string().default("2024-10-21"),
  }),
]);

export type AIProviderConfig = z.infer<typeof aiProviderConfigSchema>;
export type AIProviderKind = AIProviderConfig["kind"];
