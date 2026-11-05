export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  system?: string;
  messages: ChatTurn[];
  maxTokens?: number;
}

export interface CompletionResult {
  text: string;
  /** The model that actually answered (may differ from the requested one after a fallback). */
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  /** True when the provider declined the request (e.g. a safety refusal). */
  refused: boolean;
}

/** Every model connection, whatever the vendor, is used through this one interface. */
export interface AIProvider {
  readonly kind: string;
  complete(req: CompletionRequest): Promise<CompletionResult>;
}
