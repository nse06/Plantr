import { z } from "zod";
import { consumeLoginCode, createSession, findOrCreateUser, getGuestId, normalizeEmail } from "@/lib/server/auth";
import { claimGuestGardens } from "@/lib/server/gardens";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";
import { error, json, parseJson, sameOrigin } from "@/lib/server/http";

// Sign in with the 6-digit code from the sign-in email. Used where the emailed link would open
// in a different browser (an iPhone home-screen app, or another device).

const schema = z.object({ email: z.string().max(254), code: z.string().max(20) });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return error("Forbidden", 403);
  const parsed = await parseJson(req, schema);
  if ("response" in parsed) return parsed.response;
  const email = normalizeEmail(parsed.data.email);
  const code = parsed.data.code.replace(/\D/g, "");
  if (!email || code.length !== 6) return error("Enter the 6-digit code from the email.");

  const ip = await clientIp();
  if (!(await rateLimit(`login-code-ip:${ip}`, 30, 900)) || !(await rateLimit(`login-code-email:${email}`, 10, 3600))) {
    return error("Too many tries. Please wait a little while, or use the link in the email.", 429);
  }

  const result = await consumeLoginCode(email, code);
  if (!result) return error("That code isn't right, or it has expired. Check your latest email, or request a new one.", 400);

  const user = await findOrCreateUser(result.email);
  await createSession(user.id);
  await claimGuestGardens(user.id, await getGuestId());
  return json({ ok: true, next: result.next });
}
