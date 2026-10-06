import type { Area, GardenPlan, PlanInput } from "@/lib/garden/types";
import { getClimate } from "@/lib/garden/climate";
import { addDays, todayISO } from "@/lib/garden/dates";
import { buildPlan, planContext } from "@/lib/garden/plan";
import { designWithRules } from "@/lib/garden/recommend";
import { designWithAI } from "@/lib/ai/design";
import type { PlanRequest } from "@/lib/validation";
import { randomId } from "./crypto";

/** Use the visitor's local date when it's plausible; servers run in UTC. */
export function resolveToday(clientToday?: string): string {
  const server = todayISO();
  if (clientToday && clientToday >= addDays(server, -1) && clientToday <= addDays(server, 1)) return clientToday;
  return server;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export type GenerateResult = { ok: true; input: PlanInput; plan: GardenPlan } | { ok: false; error: string };

export async function generatePlan(req: PlanRequest): Promise<GenerateResult> {
  const found = await getClimate(req.zip);
  if (!found) {
    return { ok: false, error: "We couldn't find that ZIP code. Plantr currently supports U.S. ZIP codes." };
  }
  const climate = req.frost
    ? { ...found, lastFrost: req.frost.lastFrost, firstFrost: req.frost.firstFrost, frostFree: false, source: "user" as const }
    : found;
  const today = resolveToday(req.today);

  let beds = 0;
  let pots = 0;
  const areas: Area[] = req.areas.map((a) =>
    a.kind === "bed"
      ? { ...a, id: randomId(8), name: a.name || `${a.raised ? "Bed" : "Plot"} ${++beds}` }
      : { ...a, id: randomId(8), name: a.name || (++pots === 1 ? "Containers" : `Containers ${pots}`) },
  );

  const input: PlanInput = {
    zip: req.zip,
    climate,
    spaceType: req.spaceType,
    areas,
    bedsReady: req.bedsReady,
    sun: req.sun,
    goals: req.goals,
    wants: req.wants,
    notes: req.notes,
    household: req.household,
    experience: req.experience,
    time: req.time,
    season: req.season,
    year: req.year,
    photo: req.photo ?? null,
  };

  const { ctx, evaluation } = planContext(input, today);
  if (evaluation.feasible.length === 0) {
    return { ok: false, error: "Nothing in our catalog can grow in that space this season. Try a different season or more sun." };
  }

  const aiDesign = await withTimeout(designWithAI(input, ctx, evaluation), 100_000);
  let plan = buildPlan(input, aiDesign ?? designWithRules(input, evaluation, ctx), today);
  if (plan.plants.length === 0 && aiDesign) {
    plan = buildPlan(input, designWithRules(input, evaluation, ctx), today);
  }
  if (plan.plants.length === 0) {
    return { ok: false, error: "We couldn't fit any plants into that space. Try adding a bed or containers." };
  }
  return { ok: true, input, plan };
}

export function defaultGardenName(input: PlanInput): string {
  return input.season === "fall" ? `Fall ${input.year} garden` : `${input.year} garden`;
}
