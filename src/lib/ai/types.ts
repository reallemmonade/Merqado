import type { AITier } from "./tiers";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  system?: string;
  messages: ChatTurn[];
  maxTokens?: number;
  /** Picks fast / standard / deep model. Omitted: the connection's own model. */
  tier?: AITier;
  /** Lets the model search the public web. Its citations are numbered from `citeFrom`. */
  webSearch?: { citeFrom: number; maxUses?: number };
}

/** A public web page the answer cites, numbered like the case extracts. */
export interface WebSource {
  n: number;
  url: string;
  title: string;
  text: string;
}

export interface CompletionResult {
  text: string;
  /** The model that actually answered (may differ from the requested one after a fallback). */
  model: string;
  usage: { inputTokens: number; outputTokens: number; webSearches?: number };
  /** Web pages cited in `text`, when web search was on and the provider supports it. */
  webSources?: WebSource[];
  /** True when the provider declined the request (e.g. a safety refusal). */
  refused: boolean;
}

/** Every model connection, whatever the vendor, is used through this one interface. */
export interface AIProvider {
  readonly kind: string;
  complete(req: CompletionRequest): Promise<CompletionResult>;
}
