import { sha256 } from "@/lib/server/crypto";
import { error, parseJson, sameOrigin } from "@/lib/server/http";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";
import { logShopClick } from "@/lib/server/shop";
import { shopClickSchema } from "@/lib/validation";

/** Counts a tap on a shopping-list store link (sent as a beacon): which item and store, never who. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return error("Forbidden", 403);
  // Keyed by a hash of the IP address, so even the rate limiter doesn't keep who tapped.
  if (!(await rateLimit(`shop:${sha256(await clientIp()).slice(0, 32)}`, 60, 3600))) return error("Too many requests.", 429);
  const parsed = await parseJson(req, shopClickSchema);
  if ("response" in parsed) return parsed.response;
  if (!(await logShopClick(parsed.data.merchant, parsed.data.item))) return error("Unknown item.");
  return new Response(null, { status: 204 });
}
