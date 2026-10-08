import { getCurrentUser } from "@/lib/server/auth";
import { getGarden } from "@/lib/server/gardens";
import { error, json, parseJson, sameOrigin } from "@/lib/server/http";
import { jpegFromDataUrl } from "@/lib/server/jpeg";
import { rateLimit } from "@/lib/server/rate-limit";
import { addPhoto } from "@/lib/server/social";
import { photoUploadSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

/** Add a photo update to your garden. The browser sends a resized JPEG and a thumbnail. */
export async function POST(req: Request, ctx: Ctx) {
  if (!sameOrigin(req)) return error("Forbidden", 403);
  const user = await getCurrentUser();
  if (!user) return error("Sign in first.", 401);
  const { id } = await ctx.params;
  const garden = await getGarden(id);
  if (!garden || garden.ownerId !== user.id || garden.status === "draft") return error("Garden not found.", 404);
  if (!(await rateLimit(`photo-upload:${user.id}`, 30, 86_400))) {
    return error("You've added a lot of photos today. Try again tomorrow.", 429);
  }
  const parsed = await parseJson(req, photoUploadSchema);
  if ("response" in parsed) return parsed.response;
  const image = jpegFromDataUrl(parsed.data.image);
  const thumb = jpegFromDataUrl(parsed.data.thumb);
  if (!image || !thumb) return error("Upload a JPEG photo.");
  const result = await addPhoto(garden, user, image, thumb, parsed.data.caption ?? null);
  if ("error" in result) return error(result.error);
  return json(result);
}
