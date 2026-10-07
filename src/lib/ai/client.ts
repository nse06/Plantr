import Anthropic from "@anthropic-ai/sdk";
import type { UsageLike } from "./pricing";
import { recordUsage, withinBudget, type AiFeature } from "./usage";

export type { AiFeature } from "./usage";

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

// --- Per-feature settings ----------------------------------------------------------------
// Effort is the main cost lever: it controls how much the model reasons before answering,
// and reasoning is billed as output tokens. Each feature can override the model and effort
// with PLANTR_<FEATURE>_MODEL and PLANTR_<FEATURE>_EFFORT (e.g. PLANTR_DESIGN_EFFORT=low).

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const EFFORTS: readonly Effort[] = ["low", "medium", "high", "xhigh", "max"];

const DEFAULT_EFFORT: Record<AiFeature, Effort> = {
  // Reading a photo is perception, not deliberation.
  photo: "low",
  // Choosing plants is the one real judgment call.
  design: "medium",
  ask: "low",
};

/** Haiku 4.5 and Sonnet 4.5 reject the effort parameter. */
export function supportsEffort(model: string): boolean {
  return !/claude-(haiku-4-5|sonnet-4-5)/.test(model);
}

/** The refusal-fallback beta covers the current Opus, Sonnet and Fable models. */
export function supportsFallbacks(model: string): boolean {
  return /claude-(opus-5|sonnet-5-5|fable-5|mythos-5)/.test(model);
}

export interface AiSettings {
  model: string;
  effort?: Effort;
  fallbacks: boolean;
}

export function aiSettings(feature: AiFeature): AiSettings {
  const key = feature.toUpperCase();
  const model = process.env[`PLANTR_${key}_MODEL`] || MODEL;
  const raw = process.env[`PLANTR_${key}_EFFORT`] as Effort | undefined;
  const effort = raw && EFFORTS.includes(raw) ? raw : DEFAULT_EFFORT[feature];
  return { model, effort: supportsEffort(model) ? effort : undefined, fallbacks: supportsFallbacks(model) };
}

/** Request fields that depend on the model: `model`, plus the refusal-fallback beta where supported. */
export function modelParams(s: AiSettings) {
  return s.fallbacks
    ? { model: s.model, betas: [FALLBACK_BETA], fallbacks: "default" as const }
    : { model: s.model };
}

/** `output_config.effort`, when the model takes one. */
export function effortParam(s: AiSettings): { effort?: Effort } {
  return s.effort ? { effort: s.effort } : {};
}

/** A settings fingerprint for cache keys: a change of model or effort is a different request. */
export function settingsKey(s: AiSettings): string {
  return `${s.model}/${s.effort ?? "-"}`;
}

/**
 * Run one AI call with the shared safeguards: skip it when AI is off or today's budget is
 * spent, record tokens and estimated cost, and turn any failure into `null` so callers fall
 * back to the rule-based path.
 */
export async function runAi<R extends { usage: UsageLike; stop_reason: string | null }>(
  feature: AiFeature,
  settings: AiSettings,
  call: (client: Anthropic) => Promise<R>,
): Promise<R | null> {
  const c = getClient();
  if (!c || !(await withinBudget())) return null;
  const started = Date.now();
  try {
    const response = await call(c);
    await recordUsage(
      feature,
      settings.model,
      response.usage,
      Date.now() - started,
      response.stop_reason === "refusal" ? "refusal" : "ok",
    );
    return response;
  } catch (err) {
    logAiError(feature, err);
    await recordUsage(feature, settings.model, null, Date.now() - started, "error");
    return null;
  }
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
