import Anthropic from "@anthropic-ai/sdk";

// One shared client. The SDK resolves credentials from the environment
// (ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN or an `ant auth login` profile).

export const MODEL = process.env.PLANTR_MODEL || "claude-opus-5-5";

/**
 * Server-side refusal fallbacks: if a request is declined by a safety classifier the API
 * re-runs it on Anthropic's recommended fallback model inside the same call.
 */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01" as const;

let client: Anthropic | null = null;

export function aiEnabled(): boolean {
  if (process.env.PLANTR_DISABLE_AI === "1") return false;
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export function getClient(): Anthropic | null {
  if (!aiEnabled()) return null;
  client ??= new Anthropic({ maxRetries: 2, timeout: 110_000 });
  return client;
}

/** Log API failures with enough detail to debug, without leaking user content. */
export function logAiError(where: string, err: unknown) {
  if (err instanceof Anthropic.RateLimitError) {
    console.warn(`[ai:${where}] rate limited`);
  } else if (err instanceof Anthropic.AuthenticationError) {
    console.error(`[ai:${where}] authentication failed. Check ANTHROPIC_API_KEY`);
  } else if (err instanceof Anthropic.BadRequestError) {
    console.error(`[ai:${where}] bad request: ${err.message}`);
  } else if (err instanceof Anthropic.APIError) {
    console.error(`[ai:${where}] API error ${err.status}: ${err.message}`);
  } else if (err instanceof Error) {
    console.error(`[ai:${where}] ${err.name}: ${err.message}`);
  } else {
    console.error(`[ai:${where}] unknown error`);
  }
}
