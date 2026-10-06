import { headers } from "next/headers";
import { sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

// Fixed-window rate limiting stored in the database, so it works across serverless instances.
// Protects the AI endpoints (which cost money) and the email endpoint (which can be abused).

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-real-ip") ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local"
  );
}

/** Returns true if the action is allowed. */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const now = Date.now();
  const windowStart = now - (now % (windowSeconds * 1000));
  const db = getDb();
  const rows = await db
    .insert(schema.rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: schema.rateLimits.key,
      set: {
        count: sql`CASE WHEN ${schema.rateLimits.windowStart} = ${windowStart} THEN ${schema.rateLimits.count} + 1 ELSE 1 END`,
        windowStart,
      },
    })
    .returning({ count: schema.rateLimits.count });
  return (rows[0]?.count ?? 1) <= limit;
}
