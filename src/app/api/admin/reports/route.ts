import { getCurrentUser } from "@/lib/server/auth";
import { error, json, parseJson, sameOrigin } from "@/lib/server/http";
import { isAdmin, resolveReports } from "@/lib/server/social";
import { moderationSchema } from "@/lib/validation";

/** Admins: keep reported content (and restore it), or remove it. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return error("Forbidden", 403);
  const user = await getCurrentUser();
  if (!isAdmin(user)) return error("Not found.", 404);
  const parsed = await parseJson(req, moderationSchema);
  if ("response" in parsed) return parsed.response;
  await resolveReports(parsed.data.type, parsed.data.id, parsed.data.action);
  return json({ ok: true });
}
