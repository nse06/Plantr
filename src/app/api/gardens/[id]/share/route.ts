import { getCurrentUser } from "@/lib/server/auth";
import { getGarden } from "@/lib/server/gardens";
import { error, json, parseJson, sameOrigin } from "@/lib/server/http";
import { setGardenPublic } from "@/lib/server/social";
import { shareSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

/** Show a saved garden on your public profile and in Explore, or take it back down. */
export async function POST(req: Request, ctx: Ctx) {
  if (!sameOrigin(req)) return error("Forbidden", 403);
  const user = await getCurrentUser();
  if (!user) return error("Sign in first.", 401);
  const { id } = await ctx.params;
  const garden = await getGarden(id);
  if (!garden || garden.ownerId !== user.id || garden.status === "draft") return error("Garden not found.", 404);
  const parsed = await parseJson(req, shareSchema);
  if ("response" in parsed) return parsed.response;
  const { handle } = await setGardenPublic(garden, user, parsed.data.public);
  return json({ isPublic: parsed.data.public, handle, hidden: garden.hidden });
}
