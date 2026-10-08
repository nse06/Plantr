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
  const { token, code } = await createLoginToken(email, next);
  const link = `${appUrl(req)}/auth/verify?token=${encodeURIComponent(token)}`;
  const sent = await sendEmail({
    to: email,
    // The code in the subject lets phones offer it as a one-tap autofill.
    subject: `${code} is your Plantr sign-in code`,
    text: `Your Plantr sign-in code is ${code}\n\nEnter it in Plantr, or tap this link to sign in:\n${link}\n\nBoth expire in 30 minutes. If you didn't ask for this, you can ignore this email.`,
    html: emailLayout(
      "Sign in to Plantr",
      `<p>Enter this code in Plantr:</p><p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:8px 0 16px">${code}</p><p>Or tap the button to sign in on this device.</p><p style="padding:12px 0">${buttonHtml(link, "Sign in to Plantr")}</p><p style="color:#6b7280;font-size:14px">Both expire in 30 minutes. If you didn't ask for this, you can safely ignore this email.</p>`,
    ),
  });
  if (!sent) return error("We couldn't send the email. Please try again.", 502);

  // Without an email provider configured (local development), hand the link and code back directly.
  const dev = !emailEnabled() && process.env.NODE_ENV !== "production";
  return json({ ok: true, devLink: dev ? link : undefined, devCode: dev ? code : undefined });
}
