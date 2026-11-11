/** USD per million tokens. Anthropic first-party list prices; partner clouds bill separately. */
interface Price {
  input: number;
  output: number;
}

// Most specific first: the first substring that matches wins.
const PRICES: Array<[match: string, price: Price]> = [
  ["claude-fable-5-2", { input: 8, output: 40 }],
  ["claude-fable-5", { input: 10, output: 50 }],
  ["claude-opus-5-5", { input: 4, output: 20 }],
  ["claude-opus", { input: 5, output: 25 }],
  ["claude-sonnet-5", { input: 2, output: 10 }],
  ["claude-sonnet", { input: 3, output: 15 }],
  ["claude-haiku-5-5", { input: 0.1, output: 0.5 }],
  ["claude-haiku", { input: 1, output: 5 }],
];

/** Unknown models (e.g. a firm's OpenAI deployment) are costed conservatively at Opus rates. */
const FALLBACK: Price = { input: 4, output: 20 };

export function priceFor(model: string): Price {
  const m = model.toLowerCase();
  return PRICES.find(([match]) => m.includes(match))?.[1] ?? FALLBACK;
}

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = priceFor(model);
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}
