import { z } from "zod";
import { askPlantr, gardenContext } from "@/lib/ai/ask";
import { aiEnabled } from "@/lib/ai/client";
import { getCurrentUser, getGuestId } from "@/lib/server/auth";
import { canEdit, getGarden } from "@/lib/server/gardens";
import { resolveToday } from "@/lib/server/planner";
import { rateLimit } from "@/lib/server/rate-limit";
import { error, json, parseJson, sameOrigin } from "@/lib/server/http";

export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  question: z.string().trim().min(3).max(800),
  today: z.string().optional(),
});

export async function POST(req: Request, ctx: Ctx) {
  if (!sameOrigin(req)) return error("Forbidden", 403);
  if (!aiEnabled()) return error("Ask Plantr isn't available right now.", 503);
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  const garden = await getGarden(id);
  if (!garden || !canEdit(garden, user, await getGuestId())) return error("Garden not found.", 404);

  const who = user?.id ?? garden.guestId ?? "anon";
  if (!(await rateLimit(`ask:${who}`, 25, 86_400))) {
    return error("That's a lot of questions for one day. Ask Plantr again tomorrow.", 429);
  }
  const parsed = await parseJson(req, schema);
  if ("response" in parsed) return parsed.response;

  const today = resolveToday(parsed.data.today);
  const answer = await askPlantr(parsed.data.question, gardenContext(garden.input, garden.plan, today));
  if (!answer) return error("Plantr couldn't answer that right now. Please try again.", 502);
  return json({ answer });
}
