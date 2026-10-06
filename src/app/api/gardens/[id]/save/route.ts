import { getCurrentUser, getGuestId } from "@/lib/server/auth";
import { canEdit, getGarden, saveGarden } from "@/lib/server/gardens";
import { error, json, sameOrigin } from "@/lib/server/http";

type Ctx = { params: Promise<{ id: string }> };

/** Save a plan to "My Garden". Requires an account; claims the guest's draft. */
export async function POST(req: Request, ctx: Ctx) {
  if (!sameOrigin(req)) return error("Forbidden", 403);
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return error("Sign in to save your garden.", 401);
  const garden = await getGarden(id);
  if (!garden) return error("Garden not found.", 404);
  if (!canEdit(garden, user, await getGuestId())) {
    // Someone else's shared plan: save a copy is out of scope; tell them how to make their own.
    return error("This plan belongs to someone else. Create your own plan to save it.", 403);
  }
  await saveGarden(id, user.id);
  return json({ ok: true, id });
}
