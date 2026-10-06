import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

// libSQL: a local SQLite file in development, Turso (hosted libSQL) in production.

export type DB = LibSQLDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { plantrDb?: DB; plantrClient?: Client };

export function databaseUrl(): string {
  return process.env.DATABASE_URL || "file:local.db";
}

export function getDb(): DB {
  if (!globalForDb.plantrDb) {
    globalForDb.plantrClient = createClient({
      url: databaseUrl(),
      authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
    });
    globalForDb.plantrDb = drizzle(globalForDb.plantrClient, { schema });
  }
  return globalForDb.plantrDb;
}

export { schema };
