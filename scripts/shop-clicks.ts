import { createClient } from "@libsql/client";

// Taps on shopping-list store links, from the shop_clicks table.
//
//   npm run shop:clicks              last 7 and 30 days
//   npm run shop:clicks -- --days 90 a custom window
//
// Clicks aren't sales: the store's affiliate dashboard (Amazon Associates, Impact) reports
// orders and commissions. Use this to see what people shop for, and when there's enough
// traffic to apply to a program.

const url = process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL || "file:local.db";
const authToken = process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || undefined;

const arg = process.argv.indexOf("--days");
const windows = arg > 0 ? [Number(process.argv[arg + 1]) || 30] : [7, 30];

async function main() {
  const db = createClient({ url, authToken });
  for (const days of windows) {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const stores = await db.execute({
      sql: `SELECT merchant, count(*) AS clicks, sum(affiliate) AS earning
            FROM shop_clicks WHERE created_at >= ? GROUP BY merchant ORDER BY clicks DESC`,
      args: [since],
    });
    const total = stores.rows.reduce((n, r) => n + Number(r.clicks), 0);
    console.log(`\nLast ${days} days: ${total} store link click${total === 1 ? "" : "s"}`);
    if (!total) continue;
    console.table(
      stores.rows.map((r) => ({ store: r.merchant, clicks: Number(r.clicks), "with affiliate tag": Number(r.earning) })),
    );
    const items = await db.execute({
      sql: `SELECT item, count(*) AS clicks FROM shop_clicks WHERE created_at >= ?
            GROUP BY item ORDER BY clicks DESC LIMIT 15`,
      args: [since],
    });
    console.log("Most-clicked items:");
    console.table(items.rows.map((r) => ({ item: r.item, clicks: Number(r.clicks) })));
  }
  db.close();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
