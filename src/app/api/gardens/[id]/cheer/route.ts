import { getCurrentUser } from "@/lib/server/auth";
import { getGarden } from "@/lib/server/gardens";
import { error, json, sameOrigin } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { toggleCheer } from "@/lib/server/social";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  if (!sameOrigin(req)) return error("Forbidden", 403);
  const user = await getCurrentUser();
  if (!user) return error("Sign in to cheer gardens.", 401);
  if (!(await rateLimit(`cheer:${user.id}`, 120, 3600))) return error("Slow down a little.", 429);
  const { id } = await ctx.params;
  const garden = await getGarden(id);
  const result = garden ? await toggleCheer(garden, user) : null;
  if (!result) return error("Garden not found.", 404);
  return json(result);
}
