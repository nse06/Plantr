import { z } from "zod";
import { getCurrentUser } from "@/lib/server/auth";
import { deleteGarden, getGarden, updateGarden } from "@/lib/server/gardens";
import { error, json, parseJson, sameOrigin } from "@/lib/server/http";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  status: z.enum(["active", "archived"]).optional(),
});

async function ownedGarden(id: string) {
  const user = await getCurrentUser();
  if (!user) return { response: error("Sign in to change this garden.", 401) } as const;
  const garden = await getGarden(id);
  if (!garden || garden.ownerId !== user.id) return { response: error("Garden not found.", 404) } as const;
  return { garden, user } as const;
}

export async function PATCH(req: Request, ctx: Ctx) {
  if (!sameOrigin(req)) return error("Forbidden", 403);
  const { id } = await ctx.params;
  const owned = await ownedGarden(id);
  if ("response" in owned) return owned.response;
  const parsed = await parseJson(req, patchSchema);
  if ("response" in parsed) return parsed.response;
  await updateGarden(id, parsed.data);
  return json({ ok: true });
}

export async function DELETE(req: Request, ctx: Ctx) {
  if (!sameOrigin(req)) return error("Forbidden", 403);
  const { id } = await ctx.params;
  const owned = await ownedGarden(id);
  if ("response" in owned) return owned.response;
  await deleteGarden(id);
  return json({ ok: true });
}
