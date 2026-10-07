// Estimated Claude API cost per call, for usage reports and the daily budget guard.
// Prices are U.S. dollars per million tokens from Anthropic's public price list; update them
// here if they change. Cache writes use the 5-minute rate (1.25 × input).

interface Price {
  input: number;
  output: number;
  cacheRead: number;
}

const PRICES: Record<string, Price> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1 },
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
};

/** Unknown models are estimated at the default model's price. */
const DEFAULT_PRICE = PRICES["claude-opus-5-5"];

export function priceFor(model: string): Price {
  // Dated ids ("claude-haiku-4-5-20251001") share their family's price.
  const key = Object.keys(PRICES)
    .filter((k) => model === k || model.startsWith(`${k}-`))
    .sort((a, b) => b.length - a.length)[0];
  return key ? PRICES[key] : DEFAULT_PRICE;
}

export interface TokenCounts {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export function estimateCost(model: string, t: TokenCounts): number {
  const p = priceFor(model);
  const usd =
    (t.inputTokens * p.input + t.outputTokens * p.output + t.cacheReadTokens * p.cacheRead + t.cacheWriteTokens * p.input * 1.25) /
    1_000_000;
  return Math.round(usd * 1e6) / 1e6;
}

/** The subset of the API's `usage` object we read. Fields are nullable on the wire. */
export interface UsageLike {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  output_tokens_details?: { thinking_tokens: number } | null;
  iterations?: Array<{
    type: string;
    model?: string | null;
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  }> | null;
}

export interface UsageSummary extends TokenCounts {
  thinkingTokens: number;
  costUsd: number;
}

/**
 * Token counts and estimated cost for one response. When a refusal fallback served the
 * response, each model's share is priced at that model's rate.
 */
export function summarizeUsage(model: string, usage: UsageLike): UsageSummary {
  const counts: TokenCounts = {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
  };
  const thinkingTokens = usage.output_tokens_details?.thinking_tokens ?? 0;
  const hops = (usage.iterations ?? []).filter((i) => i.type === "message" || i.type === "fallback_message");
  const costUsd =
    hops.length > 0
      ? hops.reduce(
          (sum, i) =>
            sum +
            estimateCost(i.model || model, {
              inputTokens: i.input_tokens ?? 0,
              outputTokens: i.output_tokens ?? 0,
              cacheReadTokens: i.cache_read_input_tokens ?? 0,
              cacheWriteTokens: i.cache_creation_input_tokens ?? 0,
            }),
          0,
        )
      : estimateCost(model, counts);
  return { ...counts, thinkingTokens, costUsd: Math.round(costUsd * 1e6) / 1e6 };
}
