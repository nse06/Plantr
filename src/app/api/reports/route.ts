import { getCurrentUser } from "@/lib/server/auth";
import { sha256 } from "@/lib/server/crypto";
import { error, json, parseJson, sameOrigin } from "@/lib/server/http";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";
import { reportContent } from "@/lib/server/social";
import { reportSchema } from "@/lib/validation";

/** Report a public garden or photo. Anyone can report; each person counts once per item. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return error("Forbidden", 403);
  const ip = await clientIp();
  if (!(await rateLimit(`report:${ip}`, 20, 3600))) return error("Too many reports. Try again later.", 429);
  const parsed = await parseJson(req, reportSchema);
  if ("response" in parsed) return parsed.response;
  const user = await getCurrentUser();
  // Signed-out reporters are identified by a hash of their IP address, never the address itself.
  const reporterKey = user ? user.id : `ip:${sha256(ip).slice(0, 32)}`;
  const ok = await reportContent(parsed.data.type, parsed.data.id, reporterKey, parsed.data.reason);
  if (!ok) return error("Nothing to report there.", 404);
  return json({ ok: true });
}
