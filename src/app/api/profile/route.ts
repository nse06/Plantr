import { getCurrentUser } from "@/lib/server/auth";
import { error, json, parseJson, sameOrigin } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { ensureHandle, updateProfile } from "@/lib/server/social";
import { profileSchema } from "@/lib/validation";

/** Edit your public profile: handle, display name and a short bio. */
export async function PATCH(req: Request) {
  if (!sameOrigin(req)) return error("Forbidden", 403);
  const user = await getCurrentUser();
  if (!user) return error("Sign in first.", 401);
  if (!(await rateLimit(`profile:${user.id}`, 30, 3600))) return error("Too many changes. Try again later.", 429);
  const parsed = await parseJson(req, profileSchema);
  if ("response" in parsed) return parsed.response;
  // Profiles always have a handle; a new account gets a random one unless it picks one now.
  if (parsed.data.handle === undefined) await ensureHandle(user);
  const problem = await updateProfile(user.id, parsed.data);
  if (problem) return error(problem);
  return json({ ok: true });
}
