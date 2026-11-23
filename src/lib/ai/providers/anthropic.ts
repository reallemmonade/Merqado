import Anthropic from "@anthropic-ai/sdk";
import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";
import { AnthropicVertex } from "@anthropic-ai/vertex-sdk";
import type { AIProviderConfig } from "../config";
import { modelForTier } from "../tiers";
import { hostOf } from "../web";
import type { AIProvider, CompletionRequest, CompletionResult, WebSource } from "../types";

type AnthropicFamilyConfig = Extract<AIProviderConfig, { kind: "anthropic" | "bedrock" | "vertex" }>;

const DEFAULT_MAX_TOKENS = 16000;
/** A server-side search loop can pause; resume it at most this many times. */
const MAX_CONTINUATIONS = 3;

interface Citation {
  type: string;
  url?: string;
  title?: string | null;
  cited_text?: string;
}
interface Block {
  type: string;
  text?: string;
  citations?: Citation[] | null;
}

/**
 * Joins the answer's text blocks. Web citations become [n] markers numbered from `citeFrom`,
 * one number per page, so they read like the case-extract citations.
 */
export function collectAnswer(content: Block[], citeFrom: number): { text: string; webSources: WebSource[] } {
  const byUrl = new Map<string, WebSource>();
  let text = "";
  for (const b of content) {
    if (b.type !== "text" || typeof b.text !== "string") continue;
    text += b.text;
    const marks: number[] = [];
    for (const c of b.citations ?? []) {
      if (c.type !== "web_search_result_location" || !c.url) continue;
      let src = byUrl.get(c.url);
      if (!src) {
        src = { n: citeFrom + byUrl.size, url: c.url, title: c.title?.trim() || hostOf(c.url), text: "" };
        byUrl.set(c.url, src);
      }
      const quote = (c.cited_text ?? "").trim();
      if (quote && !src.text.includes(quote)) src.text = src.text ? `${src.text} … ${quote}` : quote;
      if (!marks.includes(src.n)) marks.push(src.n);
    }
    if (marks.length) {
      const trail = text.match(/[\s.,;:]*$/)?.[0] ?? "";
      text = text.slice(0, text.length - trail.length) + marks.map((n) => ` [${n}]`).join("") + trail;
    }
  }
  return { text, webSources: [...byUrl.values()] };
}

/** Dynamic-filtering web search needs a recent Opus, Sonnet, Fable or Mythos; others get the basic tool. */
function webSearchTool(kind: AnthropicFamilyConfig["kind"], model: string, maxUses: number) {
  const recent = /fable|mythos|opus-(4-[6-9]|[5-9])|sonnet-(4-6|[5-9])/.test(model);
  const type = kind === "anthropic" && recent ? ("web_search_20260209" as const) : ("web_search_20250305" as const);
  return { type, name: "web_search" as const, max_uses: maxUses };
}

/** Claude via the first-party API, Amazon Bedrock, or Google Vertex AI. */
export class AnthropicFamilyProvider implements AIProvider {
  readonly kind: AnthropicFamilyConfig["kind"];

  constructor(private readonly config: AnthropicFamilyConfig) {
    this.kind = config.kind;
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const model = req.tier ? modelForTier(this.config, req.tier) : this.config.model;
    // Bedrock has no web search tool; there the answer comes from the case material alone.
    const web = req.webSearch && this.config.kind !== "bedrock" ? req.webSearch : undefined;
    const base = {
      model,
      max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      ...(req.system ? { system: req.system } : {}),
      ...(web ? { tools: [webSearchTool(this.config.kind, model, web.maxUses ?? 3)] } : {}),
    };

    const send = this.sender(model);
    const messages: Array<{ role: "user" | "assistant"; content: unknown }> = [...req.messages];
    const content: Block[] = [];
    const usage = { inputTokens: 0, outputTokens: 0, webSearches: 0 };
    let last: Awaited<ReturnType<typeof send>> | undefined;
    for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
      last = await send({ ...base, messages });
      content.push(...last.content);
      usage.inputTokens += last.usage.input_tokens;
      usage.outputTokens += last.usage.output_tokens;
      usage.webSearches += last.usage.server_tool_use?.web_search_requests ?? 0;
      if (last.stop_reason !== "pause_turn") break;
      // Resend with the paused turn; the server picks the search loop back up.
      messages.push({ role: "assistant", content: last.content });
    }
    const { text, webSources } = collectAnswer(content, web?.citeFrom ?? 1);
    return {
      text,
      model: last!.model,
      usage,
      ...(web ? { webSources } : {}),
      refused: last!.stop_reason === "refusal",
    };
  }

  /** One Messages call on the configured platform, returning the raw message. */
  private sender(model: string) {
    type Sent = {
      content: Block[];
      model: string;
      stop_reason: string | null;
      usage: { input_tokens: number; output_tokens: number; server_tool_use?: { web_search_requests?: number } | null };
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type Params = any;
    if (this.config.kind === "anthropic") {
      const client = new Anthropic({ apiKey: this.config.apiKey });
      // Server-side fallback reroutes a refused request to a suitable model instead of failing.
      // Haiku has no server-side fallback, so it is sent without one.
      const extra = /haiku/.test(model) ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };
      return async (p: Params): Promise<Sent> => (await client.beta.messages.create({ ...p, ...extra, stream: false })) as Sent;
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
    return async (p: Params): Promise<Sent> => (await client.messages.create({ ...p, stream: false })) as Sent;
  }
}
