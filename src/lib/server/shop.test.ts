import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

// Affiliate settings and click counting, against a throwaway SQLite database.

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "plantr-shop-test-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.db")}`;

let shop: typeof import("./shop");

beforeAll(async () => {
  const { createClient } = await import("@libsql/client");
  const { drizzle } = await import("drizzle-orm/libsql");
  const { migrate } = await import("drizzle-orm/libsql/migrator");
  const client = createClient({ url: process.env.DATABASE_URL! });
  await migrate(drizzle(client), { migrationsFolder: path.resolve(__dirname, "../../../drizzle") });
  client.close();
  shop = await import("./shop");
});

describe("affiliate settings", () => {
  it("reads the Amazon tag and Home Depot template", () => {
    expect(
      shop.shopConfig({
        AFFILIATE_AMAZON_TAG: " plantr-20 ",
        AFFILIATE_HOME_DEPOT_TEMPLATE: "https://homedepot.sjv.io/c/1/2/3?u={url}",
      }),
    ).toEqual({ amazonTag: "plantr-20", homeDepotTemplate: "https://homedepot.sjv.io/c/1/2/3?u={url}" });
    expect(shop.shopConfig({})).toEqual({ amazonTag: null, homeDepotTemplate: null });
  });

  it("ignores values that would break links, with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(shop.shopConfig({ AFFILIATE_AMAZON_TAG: "plantr 20&x=1" }).amazonTag).toBeNull();
    expect(shop.shopConfig({ AFFILIATE_HOME_DEPOT_TEMPLATE: "https://homedepot.sjv.io/c/1/2/3" }).homeDepotTemplate).toBeNull();
    expect(shop.shopConfig({ AFFILIATE_HOME_DEPOT_TEMPLATE: "http://homedepot.sjv.io/c/1/2/3?u={url}" }).homeDepotTemplate).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("click counts", () => {
  it("records the store and item, and whether the link could earn", async () => {
    const tagged = { amazonTag: "plantr-20", homeDepotTemplate: null };
    expect(await shop.logShopClick("amazon", "supply:cages", tagged)).toBe(true);
    expect(await shop.logShopClick("homedepot", "pots:my-patio", tagged)).toBe(true);
    expect(await shop.logShopClick("amazon", "javascript:alert(1)", tagged)).toBe(false);

    const { getDb, schema } = await import("@/db");
    const rows = await getDb().select().from(schema.shopClicks);
    expect(rows.map(({ merchant, item, affiliate }) => ({ merchant, item, affiliate }))).toEqual([
      { merchant: "amazon", item: "supply:cages", affiliate: true },
      { merchant: "homedepot", item: "pots", affiliate: false },
    ]);
  });
});
