import { sendWeeklyDigests } from "@/lib/server/digest";
import { todayISO } from "@/lib/garden/dates";
import { error, json } from "@/lib/server/http";

export const maxDuration = 300;

/** Called weekly by Vercel Cron (see vercel.json) with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const authorized = secret
    ? req.headers.get("authorization") === `Bearer ${secret}`
    : process.env.NODE_ENV !== "production";
  if (!authorized) return error("Unauthorized", 401);
  const result = await sendWeeklyDigests(todayISO());
  return json(result);
}
