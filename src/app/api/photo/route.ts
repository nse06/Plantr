import { analyzePhoto } from "@/lib/ai/photo";
import { aiEnabled } from "@/lib/ai/client";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";
import { error, json, parseJson, sameOrigin } from "@/lib/server/http";
import { photoRequestSchema } from "@/lib/validation";

export const maxDuration = 120;

export async function POST(req: Request) {
  if (!sameOrigin(req)) return error("Forbidden", 403);
  if (!aiEnabled()) return json({ analysis: null, aiEnabled: false });

  const ip = await clientIp();
  if (!(await rateLimit(`photo:${ip}`, 15, 3600))) {
    return error("You've analyzed a lot of photos. Try again in a little while, or enter your space by hand.", 429);
  }
  const parsed = await parseJson(req, photoRequestSchema);
  if ("response" in parsed) return parsed.response;

  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(parsed.data.image);
  if (!match) return error("Unsupported image format. Use a JPEG, PNG or WebP photo.");
  const mediaType = match[1] as "image/jpeg" | "image/png" | "image/webp";

  const analysis = await analyzePhoto(match[2], mediaType);
  return json({ analysis, aiEnabled: true });
}
