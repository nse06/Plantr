import { z } from "zod";
import { getCurrentUser } from "@/lib/server/auth";
import { getGarden, setTaskDone } from "@/lib/server/gardens";
import { error, json, parseJson, sameOrigin } from "@/lib/server/http";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({ taskId: z.string().min(1).max(120), done: z.boolean() });

export async function POST(req: Request, ctx: Ctx) {
  if (!sameOrigin(req)) return error("Forbidden", 403);
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return error("Sign in to track your tasks.", 401);
  const garden = await getGarden(id);
  if (!garden || garden.ownerId !== user.id) return error("Garden not found.", 404);
  const parsed = await parseJson(req, schema);
  if ("response" in parsed) return parsed.response;
  if (!garden.plan.tasks.some((t) => t.id === parsed.data.taskId)) return error("Unknown task.", 404);
  await setTaskDone(id, parsed.data.taskId, parsed.data.done);
  return json({ ok: true });
}
