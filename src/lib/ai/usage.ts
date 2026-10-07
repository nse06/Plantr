import { createHash } from "node:crypto";
import { and, eq, gt, gte, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { summarizeUsage, type UsageLike } from "./pricing";

// Usage logging, the daily spend guard and the AI result cache. Everything here is
// best-effort: a database hiccup must never break planning, so failures are logged and ignored.

export type AiFeature = "photo" | "design" | "ask";
export type AiOutcome = "ok" | "cached" | "refusal" | "error";

export async function recordUsage(
  feature: AiFeature,
  model: string,
  usage: UsageLike | null,
  latencyMs: number,
  outcome: AiOutcome,
): Promise<void> {
  const s = usage
    ? summarizeUsage(model, usage)
    : { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0, costUsd: 0 };
  if (spend && spend.day === utcDay()) spend.usd += s.costUsd;
  try {
    await getDb()
      .insert(schema.aiUsage)
      .values({ feature, model, ...s, latencyMs, outcome, createdAt: new Date().toISOString() });
  } catch (err) {
    console.warn(`[ai:${feature}] couldn't record usage: ${err instanceof Error ? err.message : "unknown error"}`);
  }
}

const utcDay = () => new Date().toISOString().slice(0, 10);

/** Daily AI spend cap in U.S. dollars, from PLANTR_AI_DAILY_BUDGET_USD. Defaults to $10; "off" removes it. */
export function dailyBudgetUsd(): number | null {
  const raw = process.env.PLANTR_AI_DAILY_BUDGET_USD?.trim().toLowerCase();
  if (raw === "off" || raw === "none") return null;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 10;
}

let spend: { day: string; usd: number; checkedAt: number } | null = null;
let warnedDay = "";

/**
 * False once today's estimated AI spend (UTC day) reaches the daily budget. Callers then fall
 * back to the rule-based planner, so the app keeps working. The total is re-read from the
 * database at most once a minute, so several server instances can overshoot slightly.
 */
export async function withinBudget(): Promise<boolean> {
  const budget = dailyBudgetUsd();
  if (budget === null) return true;
  const day = utcDay();
  const now = Date.now();
  if (!spend || spend.day !== day || now - spend.checkedAt > 60_000) {
    try {
      const [row] = await getDb()
        .select({ usd: sql<number>`coalesce(sum(${schema.aiUsage.costUsd}), 0)` })
        .from(schema.aiUsage)
        .where(gte(schema.aiUsage.createdAt, day));
      spend = { day, usd: Number(row?.usd ?? 0), checkedAt: now };
    } catch (err) {
      console.warn(`[ai] couldn't read today's spend: ${err instanceof Error ? err.message : "unknown error"}`);
      return true;
    }
  }
  if (spend.usd < budget) return true;
  if (warnedDay !== day) {
    warnedDay = day;
    console.warn(`[ai] daily budget of $${budget} reached ($${spend.usd.toFixed(2)} today); using the rule-based planner until tomorrow (UTC).`);
  }
  return false;
}

/** A stable key for an AI request: the same inputs, prompt version and settings give the same key. */
export function cacheKey(feature: AiFeature, ...parts: string[]): string {
  const h = createHash("sha256");
  h.update(feature);
  for (const p of parts) h.update(`\u0000${p}`);
  return `${feature}:${h.digest("base64url")}`;
}

/** PLANTR_AI_CACHE=off skips the cache, e.g. when comparing settings. */
const cacheOff = () => process.env.PLANTR_AI_CACHE === "off";

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (cacheOff()) return null;
  try {
    const [row] = await getDb()
      .select({ value: schema.aiCache.value })
      .from(schema.aiCache)
      .where(and(eq(schema.aiCache.key, key), gt(schema.aiCache.expiresAt, Date.now())))
      .limit(1);
    return row ? (row.value as T) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, feature: AiFeature, value: unknown, ttlDays: number): Promise<void> {
  if (cacheOff()) return;
  const now = Date.now();
  const expiresAt = now + ttlDays * 86_400_000;
  try {
    const db = getDb();
    await db
      .insert(schema.aiCache)
      .values({ key, feature, value, expiresAt, createdAt: new Date(now).toISOString() })
      .onConflictDoUpdate({ target: schema.aiCache.key, set: { value, expiresAt } });
    // Keep the table small: clear out expired entries now and then.
    if (Math.random() < 0.05) await db.delete(schema.aiCache).where(lt(schema.aiCache.expiresAt, now));
  } catch (err) {
    console.warn(`[ai:${feature}] couldn't cache result: ${err instanceof Error ? err.message : "unknown error"}`);
  }
}
