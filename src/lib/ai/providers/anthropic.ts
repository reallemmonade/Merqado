import Anthropic from "@anthropic-ai/sdk";
import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";
import { AnthropicVertex } from "@anthropic-ai/vertex-sdk";
import type { AIProviderConfig } from "../config";
import { modelForTier } from "../tiers";
import type { AIProvider, CompletionRequest, CompletionResult } from "../types";

type AnthropicFamilyConfig = Extract<AIProviderConfig, { kind: "anthropic" | "bedrock" | "vertex" }>;

const DEFAULT_MAX_TOKENS = 16000;

function textOf(content: Array<{ type: string }>): string {
  return content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** Claude via the first-party API, Amazon Bedrock, or Google Vertex AI. */
export class AnthropicFamilyProvider implements AIProvider {
  readonly kind: AnthropicFamilyConfig["kind"];

  constructor(private readonly config: AnthropicFamilyConfig) {
    this.kind = config.kind;
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const model = req.tier ? modelForTier(this.config, req.tier) : this.config.model;
    const params = {
      model,
      max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      ...(req.system ? { system: req.system } : {}),
      messages: req.messages,
    };

    if (this.config.kind === "anthropic") {
      const client = new Anthropic({ apiKey: this.config.apiKey });
      // Server-side fallback reroutes a refused request to a suitable model instead of failing.
      // Haiku has no server-side fallback, so it is sent without one.
      const msg = await client.beta.messages.create(
        /haiku/.test(model)
          ? params
          : { ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const },
      );
      return {
        text: textOf(msg.content),
        model: msg.model,
        usage: { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens },
        refused: msg.stop_reason === "refusal",
      };
    }

    const client =
      this.config.kind === "bedrock"
        ? new AnthropicBedrockMantle({
            awsRegion: this.config.awsRegion,
            ...(this.config.awsAccessKey
              ? { awsAccessKey: this.config.awsAccessKey, awsSecretAccessKey: this.config.awsSecretAccessKey }
              : {}),
          })
        : new AnthropicVertex({ projectId: this.config.projectId, region: this.config.region });

    const msg = await client.messages.create(params);
    return {
      text: textOf(msg.content),
      model: msg.model,
      usage: { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens },
      refused: msg.stop_reason === "refusal",
    };
  }
}
