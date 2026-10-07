import { afterEach, describe, expect, it } from "vitest";
import { estimateCost, priceFor, summarizeUsage } from "./pricing";
import { aiSettings, modelParams } from "./client";
import { cacheKey, dailyBudgetUsd } from "./usage";

describe("AI cost estimates", () => {
  it("prices Opus 5.5 input, output and cache tokens", () => {
    // 1M in + 1M out = $4 + $20; cache reads $0.20/M; cache writes 1.25 × input.
    expect(estimateCost("claude-opus-5-5", { inputTokens: 1e6, outputTokens: 1e6, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBe(24);
    expect(estimateCost("claude-opus-5-5", { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1e6, cacheWriteTokens: 1e6 })).toBe(5.2);
  });

  it("matches dated model ids and estimates unknown models at the default price", () => {
    expect(priceFor("claude-haiku-4-5-20251001").input).toBe(1);
    expect(priceFor("claude-someday-9").input).toBe(4);
  });

  it("prices each model's share when a refusal fallback served the response", () => {
    const s = summarizeUsage("claude-opus-5-5", {
      input_tokens: 2000,
      output_tokens: 1000,
      output_tokens_details: { thinking_tokens: 600 },
      iterations: [
        { type: "message", input_tokens: 1000, output_tokens: 0 },
        { type: "fallback_message", model: "claude-sonnet-5-5", input_tokens: 1000, output_tokens: 1000 },
      ],
    });
    expect(s.thinkingTokens).toBe(600);
    // Opus: 1000 in = $0.004. Sonnet: 1000 in + 1000 out = $0.002 + $0.01.
    expect(s.costUsd).toBeCloseTo(0.016, 6);
  });
});

describe("AI settings", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("uses low effort for photos and questions, medium for design", () => {
    delete process.env.PLANTR_PHOTO_EFFORT;
    delete process.env.PLANTR_DESIGN_EFFORT;
    expect(aiSettings("photo").effort).toBe("low");
    expect(aiSettings("design").effort).toBe("medium");
    expect(aiSettings("ask").effort).toBe("low");
  });

  it("takes per-feature overrides and drops parameters a model doesn't accept", () => {
    process.env.PLANTR_DESIGN_EFFORT = "low";
    process.env.PLANTR_ASK_MODEL = "claude-haiku-4-5";
    expect(aiSettings("design").effort).toBe("low");
    const ask = aiSettings("ask");
    expect(ask).toEqual({ model: "claude-haiku-4-5", effort: undefined, fallbacks: false });
    expect(modelParams(ask)).toEqual({ model: "claude-haiku-4-5" });
    expect(modelParams(aiSettings("photo"))).toMatchObject({ fallbacks: "default" });
  });

  it("caps daily spend at $10 unless configured", () => {
    delete process.env.PLANTR_AI_DAILY_BUDGET_USD;
    expect(dailyBudgetUsd()).toBe(10);
    process.env.PLANTR_AI_DAILY_BUDGET_USD = "2.5";
    expect(dailyBudgetUsd()).toBe(2.5);
    process.env.PLANTR_AI_DAILY_BUDGET_USD = "off";
    expect(dailyBudgetUsd()).toBeNull();
  });

  it("builds cache keys from every part of the request", () => {
    expect(cacheKey("design", "v1", "a")).toBe(cacheKey("design", "v1", "a"));
    expect(cacheKey("design", "v1", "a")).not.toBe(cacheKey("design", "v1", "b"));
    expect(cacheKey("design", "v1a", "b")).not.toBe(cacheKey("design", "v1", "ab"));
  });
});
