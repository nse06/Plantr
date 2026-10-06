import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

// Applies pending SQL migrations from ./drizzle. Safe to run on every deploy.

async function main() {
  const url = process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL || "file:local.db";
  if (process.env.VERCEL && url.startsWith("file:")) {
    throw new Error(
      "No database configured. Set DATABASE_URL and DATABASE_AUTH_TOKEN (or add the Turso integration) in your Vercel project settings.",
    );
  }
  const authToken = process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || undefined;
  const client = createClient({ url, authToken });
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  client.close();
  console.log(`Database is up to date (${url.startsWith("file:") ? url : "remote"}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
