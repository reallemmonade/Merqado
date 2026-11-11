import OpenAI, { AzureOpenAI } from "openai";
import type { AIProviderConfig } from "../config";
import { baseModel, modelForTier } from "../tiers";
import type { AIProvider, CompletionRequest, CompletionResult } from "../types";

type OpenAIFamilyConfig = Extract<AIProviderConfig, { kind: "openai" | "azure-openai" }>;

/** For firms standardized on OpenAI, Azure OpenAI, or an OpenAI-compatible internal gateway. */
export class OpenAIFamilyProvider implements AIProvider {
  readonly kind: OpenAIFamilyConfig["kind"];

  constructor(private readonly config: OpenAIFamilyConfig) {
    this.kind = config.kind;
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const c = this.config;
    const model = req.tier ? modelForTier(c, req.tier) : baseModel(c);
    const client =
      c.kind === "azure-openai"
        ? new AzureOpenAI({ apiKey: c.apiKey, endpoint: c.endpoint, deployment: model, apiVersion: c.apiVersion })
        : new OpenAI({ apiKey: c.apiKey, baseURL: c.baseURL });

    const res = await client.chat.completions.create({
      model,
      max_completion_tokens: req.maxTokens ?? 16000,
      messages: [...(req.system ? [{ role: "system" as const, content: req.system }] : []), ...req.messages],
    });
    const choice = res.choices[0];
    return {
      text: choice?.message?.content ?? "",
      model: res.model,
      usage: { inputTokens: res.usage?.prompt_tokens ?? 0, outputTokens: res.usage?.completion_tokens ?? 0 },
      refused: Boolean(choice?.message?.refusal) || choice?.finish_reason === "content_filter",
    };
  }
}
