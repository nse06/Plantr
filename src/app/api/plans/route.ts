import { ensureGuestId, getCurrentUser } from "@/lib/server/auth";
import { insertGarden } from "@/lib/server/gardens";
import { defaultGardenName, generatePlan } from "@/lib/server/planner";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";
import { error, json, parseJson, sameOrigin } from "@/lib/server/http";
import { planRequestSchema } from "@/lib/validation";

export const maxDuration = 120;

export async function POST(req: Request) {
  if (!sameOrigin(req)) return error("Forbidden", 403);
  const ip = await clientIp();
  if (!(await rateLimit(`plan:${ip}`, 12, 3600))) {
    return error("You've made a lot of plans in the last hour. Take a breather and try again soon.", 429);
  }
  const parsed = await parseJson(req, planRequestSchema);
  if ("response" in parsed) return parsed.response;
  const body = parsed.data;

  const result = await generatePlan(body);
  if (!result.ok) return error(result.error, 422);

  const user = await getCurrentUser();
  const guestId = await ensureGuestId();
  const garden = await insertGarden({
    ownerId: user?.id ?? null,
    guestId,
    name: body.name || defaultGardenName(result.input),
    input: result.input,
    plan: result.plan,
    photo: body.photoThumb ?? null,
  });
  return json({ id: garden.id });
}
