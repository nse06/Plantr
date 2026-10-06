import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

// Applies pending SQL migrations from ./drizzle. Safe to run on every deploy.

async function main() {
  const url = process.env.DATABASE_URL || "file:local.db";
  if (process.env.VERCEL && url.startsWith("file:")) {
    throw new Error("DATABASE_URL must point at a hosted libSQL/Turso database in production.");
  }
  const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN || undefined });
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  client.close();
  console.log(`Database is up to date (${url.startsWith("file:") ? url : "remote"}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
