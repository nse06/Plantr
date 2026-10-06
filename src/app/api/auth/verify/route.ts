import { consumeLoginToken, createSession, findOrCreateUser, getGuestId } from "@/lib/server/auth";
import { claimGuestGardens } from "@/lib/server/gardens";
import { sameOrigin } from "@/lib/server/http";

// The emailed link opens /auth/verify, which POSTs here. Requiring a POST (a button tap)
// stops email security scanners that pre-fetch links from burning the one-time token.

export async function POST(req: Request) {
  const base = new URL(req.url);
  if (!sameOrigin(req)) return Response.redirect(new URL("/login?error=invalid", base), 303);
  const form = await req.formData().catch(() => null);
  const token = form?.get("token");
  if (typeof token !== "string" || token.length < 20) {
    return Response.redirect(new URL("/login?error=invalid", base), 303);
  }
  const result = await consumeLoginToken(token);
  if (!result) return Response.redirect(new URL("/login?error=expired", base), 303);

  const user = await findOrCreateUser(result.email);
  await createSession(user.id);
  await claimGuestGardens(user.id, await getGuestId());
  return Response.redirect(new URL(result.next, base), 303);
}
