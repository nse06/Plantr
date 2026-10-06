import { getClimate, isValidZip, seasonLengthDays, STATE_NAMES } from "@/lib/garden/climate";
import { seasonOptions } from "@/lib/garden/schedule";
import { resolveToday } from "@/lib/server/planner";
import { error, json } from "@/lib/server/http";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const zip = url.searchParams.get("zip")?.trim() ?? "";
  if (!isValidZip(zip)) return error("Enter a 5-digit U.S. ZIP code.");
  const climate = await getClimate(zip);
  if (!climate) return error("We couldn't find that ZIP code. Plantr currently supports U.S. ZIP codes.", 404);
  const today = resolveToday(url.searchParams.get("today") ?? undefined);
  return json({
    climate,
    stateName: climate.state ? STATE_NAMES[climate.state] ?? climate.state : null,
    seasonDays: seasonLengthDays(climate),
    seasons: seasonOptions(climate, today),
  });
}
