import { getDb, schema } from "@/db";
import { type MerchantId, type ShopConfig, clickItemKey, earnsCommission } from "@/lib/shop";

// Affiliate settings and click counts for the shopping list's store links (see src/lib/shop.ts).

const warned = new Set<string>();

function warnOnce(name: string, problem: string) {
  if (warned.has(name)) return;
  warned.add(name);
  console.warn(`[shop] Ignoring ${name}: ${problem}. Store links still work but won't earn commissions.`);
}

function validTemplate(template: string): boolean {
  if (!template.includes("{url}")) return false;
  try {
    return new URL(template.replace("{url}", "x")).protocol === "https:";
  } catch {
    return false;
  }
}

/** Affiliate settings from the environment. A bad value is ignored, so links never break. */
export function shopConfig(env: Record<string, string | undefined> = process.env): ShopConfig {
  const tag = env.AFFILIATE_AMAZON_TAG?.trim() ?? "";
  const template = env.AFFILIATE_HOME_DEPOT_TEMPLATE?.trim() ?? "";
  const tagOk = /^[A-Za-z0-9_-]{1,64}$/.test(tag);
  const templateOk = validTemplate(template);
  if (tag && !tagOk) warnOnce("AFFILIATE_AMAZON_TAG", "expected a tracking ID like plantr-20");
  if (template && !templateOk) warnOnce("AFFILIATE_HOME_DEPOT_TEMPLATE", "expected an https link containing {url}");
  return { amazonTag: tagOk ? tag : null, homeDepotTemplate: templateOk ? template : null };
}

/** Counts one tap on a store link. Stores the item and store only: no user, garden or IP. */
export async function logShopClick(merchant: MerchantId, itemId: string, config: ShopConfig = shopConfig()): Promise<boolean> {
  const item = clickItemKey(itemId);
  if (!item) return false;
  await getDb()
    .insert(schema.shopClicks)
    .values({ merchant, item, affiliate: earnsCommission(config, merchant), createdAt: new Date().toISOString() });
  return true;
}
