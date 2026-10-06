import { z } from "zod";
import { createLoginToken, normalizeEmail, safeNext } from "@/lib/server/auth";
import { appUrl, buttonHtml, emailEnabled, emailLayout, sendEmail } from "@/lib/server/email";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";
import { error, json, parseJson, sameOrigin } from "@/lib/server/http";

const schema = z.object({ email: z.string().max(254), next: z.string().max(300).optional() });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return error("Forbidden", 403);
  const parsed = await parseJson(req, schema);
  if ("response" in parsed) return parsed.response;
  const email = normalizeEmail(parsed.data.email);
  if (!email) return error("Enter a valid email address.");

  const ip = await clientIp();
  if (!(await rateLimit(`login-ip:${ip}`, 10, 900)) || !(await rateLimit(`login-email:${email}`, 5, 900))) {
    return error("Too many sign-in emails. Please wait a few minutes and try again.", 429);
  }

  const next = safeNext(parsed.data.next);
  const token = await createLoginToken(email, next);
  const link = `${appUrl()}/auth/verify?token=${encodeURIComponent(token)}`;
  const sent = await sendEmail({
    to: email,
    subject: "Your Plantr sign-in link",
    text: `Tap the link below to sign in to Plantr. It expires in 30 minutes.\n\n${link}\n\nIf you didn't ask for this, you can ignore this email.`,
    html: emailLayout(
      "Sign in to Plantr",
      `<p>Tap the button below to sign in. The link expires in 30 minutes.</p><p style="padding:12px 0">${buttonHtml(link, "Sign in to Plantr")}</p><p style="color:#6b7280;font-size:14px">If you didn't ask for this, you can safely ignore this email.</p>`,
    ),
  });
  if (!sent) return error("We couldn't send the email. Please try again.", 502);

  // Without an email provider configured (local development), hand the link back directly.
  const devLink = !emailEnabled() && process.env.NODE_ENV !== "production" ? link : undefined;
  return json({ ok: true, devLink });
}
