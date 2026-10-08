import type { ShoppingItem } from "@/lib/garden/types";

// Store links for the shopping list, safe to use in the browser. Each item links to a search on
// the store's own site, so links never go stale and work for any variety. When an affiliate tag
// or template is set (see src/lib/server/shop.ts), the same links earn a commission.
// Merchant data lives here, apart from the horticultural data in src/lib/garden.

export type MerchantId = "amazon" | "homedepot";

export const MERCHANTS: Record<MerchantId, { name: string }> = {
  amazon: { name: "Amazon" },
  homedepot: { name: "Home Depot" },
};

/** Affiliate settings, read from the environment on the server and passed to the page. */
export interface ShopConfig {
  /** Amazon Associates tracking ID, e.g. "plantr-20". */
  amazonTag: string | null;
  /** Home Depot affiliate deep link (from Impact) with {url} where the store URL goes. */
  homeDepotTemplate: string | null;
}

export const NO_AFFILIATES: ShopConfig = { amazonTag: null, homeDepotTemplate: null };

export type ShopKind = "seeds" | "plants" | "soil" | "supplies";

export interface ShopLink {
  merchant: MerchantId;
  name: string;
  url: string;
  /** The link earns a commission (an affiliate tag or template is set for this store). */
  affiliate: boolean;
}

/** Stores to offer for each kind of item, best first. */
const STORES: Record<ShopKind, MerchantId[]> = {
  seeds: ["amazon", "homedepot"],
  // Nursery plants and bulky bags: a local store's stock and in-store pickup beat shipping.
  plants: ["homedepot", "amazon"],
  soil: ["homedepot", "amazon"],
  supplies: ["amazon", "homedepot"],
};

/** Search terms for items whose names read better as a description than as a search. */
const QUERIES: Record<string, string | ((name: string) => string)> = {
  "soil:raised-mix": "raised bed soil",
  "soil:compost": "organic compost",
  "soil:potting-mix": (name) => (/indoor/i.test(name) ? "indoor potting mix" : "potting mix"),
  "supply:cages": "heavy duty tomato cages",
  "supply:stakes": (name) => (/^small/i.test(name) ? "small plant stakes" : "garden stakes and plant ties"),
  "supply:trellis": "garden trellis netting",
  "supply:mulch": "straw mulch",
  "supply:fertilizer": (name) => (/liquid/i.test(name) ? "liquid all purpose plant food" : "organic all purpose fertilizer"),
  "supply:seed-starting": "seed starting kit",
  "supply:row-cover": "floating row cover",
  "supply:drip": "soaker hose",
  "supply:grow-light": "led grow light",
  "supply:timer": "outlet timer",
  "supply:sticky-traps": "yellow sticky traps",
  "supply:mister": "plant mister spray bottle",
  "supply:brush": "small paint brush set",
};

const MAX_QUERY = 80;

function tidy(text: string): string {
  return text
    .replace(/\([^)]*\)/g, " ")
    .replace(/[&+]/g, " ")
    .replace(/[^\p{L}\p{N}'.\- ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, MAX_QUERY)
    .trim();
}

/** What to search for, and what kind of item it is. Null for things you don't buy online. */
export function shopQuery(item: ShoppingItem): { q: string; kind: ShopKind } | null {
  const [prefix] = item.id.split(":");
  if (prefix === "plant") {
    // Green onions regrow from grocery-store scraps.
    if (/grocery store/i.test(item.name)) return null;
    // Names end with the variety in quotes: "Cantaloupe seeds 'Hale's Best Jumbo'".
    const [, base = item.name, variety] = item.name.match(/^(.*?)\s+'(.+)'$/) ?? [];
    if (/\bseeds?\b/i.test(base)) return { q: tidy(variety ? `${variety} ${base}` : base), kind: "seeds" };
    // Nursery plants: stores stock different varieties, so search for the crop.
    return { q: tidy(base.replace(/\bplants\b/i, "plant")), kind: "plants" };
  }
  if (prefix === "pots") {
    const inches = item.name.match(/^(\d+)-inch/);
    const gallons = item.name.match(/^(\d+(?:\.\d+)?)-gallon/);
    const q = inches ? `${inches[1]} inch plant pots with saucers` : gallons ? `${gallons[1]} gallon fabric grow bags` : "plant pots";
    return { q, kind: "supplies" };
  }
  if (prefix === "build") {
    const size = item.id.match(/^build:([\d.]+)x([\d.]+)$/);
    return { q: size ? `${size[1]}x${size[2]} raised garden bed` : "raised garden bed kit", kind: "supplies" };
  }
  const known = Object.hasOwn(QUERIES, item.id) ? QUERIES[item.id] : undefined;
  const q = typeof known === "function" ? known(item.name) : (known ?? tidy(item.name));
  if (!q) return null;
  return { q, kind: item.group === "Soil & amendments" ? "soil" : item.group === "Plants & seeds" ? "plants" : "supplies" };
}

/** A store search URL, wrapped in the affiliate tag or deep link when one is configured. */
export function merchantUrl(merchant: MerchantId, q: string, config: ShopConfig): { url: string; affiliate: boolean } {
  if (merchant === "amazon") {
    const url = new URL("https://www.amazon.com/s");
    url.searchParams.set("k", q);
    if (config.amazonTag) url.searchParams.set("tag", config.amazonTag);
    return { url: url.toString(), affiliate: Boolean(config.amazonTag) };
  }
  const search = `https://www.homedepot.com/s/${encodeURIComponent(q)}`;
  if (!config.homeDepotTemplate) return { url: search, affiliate: false };
  return { url: config.homeDepotTemplate.replace("{url}", encodeURIComponent(search)), affiliate: true };
}

/** Store links for one shopping-list item, best store first. */
export function shopLinks(item: ShoppingItem, config: ShopConfig): ShopLink[] {
  const query = shopQuery(item);
  if (!query) return [];
  return STORES[query.kind].map((merchant) => ({ merchant, name: MERCHANTS[merchant].name, ...merchantUrl(merchant, query.q, config) }));
}

/** Whether links to a store (or to any store) earn a commission, which is when the page must say so. */
export function earnsCommission(config: ShopConfig, merchant?: MerchantId): boolean {
  if (merchant === "amazon") return Boolean(config.amazonTag);
  if (merchant === "homedepot") return Boolean(config.homeDepotTemplate);
  return Boolean(config.amazonTag || config.homeDepotTemplate);
}

/** The item id as recorded for click counts. Pot lines are named after the user's own areas, so they share one key. */
export function clickItemKey(itemId: string): string | null {
  if (itemId.startsWith("pots:")) return "pots";
  return /^(plant|soil|supply|build):[a-z0-9.-]{1,40}$/.test(itemId) ? itemId : null;
}
