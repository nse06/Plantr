import { createClient } from "@libsql/client";

// AI usage and cost report from the ai_usage table.
//
//   npm run ai:usage              last 1, 7 and 30 days
//   npm run ai:usage -- --days 90 a custom window
//
// Costs are estimates from token counts and list prices (src/lib/ai/pricing.ts). Your
// Claude Console billing page is the source of truth.

const url = process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL || "file:local.db";
const authToken = process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || undefined;

const arg = process.argv.indexOf("--days");
const windows = arg > 0 ? [Number(process.argv[arg + 1]) || 30] : [1, 7, 30];

const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;
const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${Math.round(n)}`);

async function main() {
  const db = createClient({ url, authToken });
  for (const days of windows) {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const { rows } = await db.execute({
      sql: `SELECT feature,
              count(*) AS calls,
              sum(outcome = 'cached') AS cached,
              sum(outcome IN ('error', 'refusal')) AS failed,
              avg(CASE WHEN outcome = 'ok' THEN input_tokens + cache_read_tokens + cache_write_tokens END) AS avg_in,
              avg(CASE WHEN outcome = 'ok' THEN output_tokens END) AS avg_out,
              avg(CASE WHEN outcome = 'ok' THEN thinking_tokens END) AS avg_thinking,
              avg(CASE WHEN outcome = 'ok' THEN cost_usd END) AS avg_cost,
              avg(CASE WHEN outcome = 'ok' THEN latency_ms END) AS avg_ms,
              coalesce(sum(cost_usd), 0) AS cost
            FROM ai_usage WHERE created_at >= ? GROUP BY feature ORDER BY cost DESC`,
      args: [since],
    });
    const total = rows.reduce((n, r) => n + Number(r.cost), 0);
    console.log(`\nLast ${days} day${days === 1 ? "" : "s"}: ${usd(total)} estimated`);
    if (!rows.length) {
      console.log("  No AI calls recorded.");
      continue;
    }
    console.table(
      rows.map((r) => ({
        feature: r.feature,
        calls: Number(r.calls),
        cached: Number(r.cached),
        failed: Number(r.failed),
        "avg in": k(Number(r.avg_in ?? 0)),
        "avg out": k(Number(r.avg_out ?? 0)),
        "of which thinking": k(Number(r.avg_thinking ?? 0)),
        "avg cost": usd(Number(r.avg_cost ?? 0)),
        "avg secs": (Number(r.avg_ms ?? 0) / 1000).toFixed(1),
        total: usd(Number(r.cost)),
      })),
    );
  }
  db.close();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
