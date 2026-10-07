import type { Area, GardenPlan, Goal, PlanInput } from "@/lib/garden/types";
import { getClimate } from "@/lib/server/climate";
import { addDays, todayISO } from "@/lib/garden/dates";
import { buildPlan, planContext } from "@/lib/garden/plan";
import { designWithRules } from "@/lib/garden/recommend";
import { designWithAI } from "@/lib/ai/design";
import { indoorSun } from "@/lib/garden/indoor";
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

/**
 * Whether a plan is worth an AI design call. PLANTR_AI_DESIGN is "smart" (the default),
 * "always" or "never". The rule-based designer already handles goals, picked plants,
 * household, experience, sun and space well, so in smart mode the model is only called when
 * there's something for it to interpret: the person's own words, or a photo of the space.
 */
export function shouldUseAiDesign(input: PlanInput): boolean {
  const mode = (process.env.PLANTR_AI_DESIGN || "smart").toLowerCase();
  if (mode === "never" || mode === "off") return false;
  if (mode === "always") return true;
  return input.notes.trim().length >= 3 || Boolean(input.photo?.isGardenSpace);
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

  const indoor = req.spaceType === "indoor";
  let beds = 0;
  let pots = 0;
  const potsName = indoor ? "Windowsill" : "Containers";
  const areas: Area[] = req.areas.map((a) =>
    a.kind === "bed"
      ? { ...a, id: randomId(8), name: a.name || `${a.raised ? "Bed" : "Plot"} ${++beds}` }
      : { ...a, id: randomId(8), name: a.name || (++pots === 1 ? potsName : `${potsName} ${pots}`) },
  );

  const input: PlanInput = {
    zip: req.zip,
    climate,
    spaceType: req.spaceType,
    areas,
    bedsReady: req.bedsReady,
    // Indoors, "sun" is derived from the window and any grow light.
    sun: indoor ? indoorSun(req.indoor) : req.sun,
    goals: req.goals,
    wants: req.wants,
    notes: req.notes,
    household: req.household,
    experience: req.experience,
    time: req.time,
    season: req.season,
    year: req.year,
    photo: req.photo ?? null,
    indoor: indoor ? (req.indoor ?? null) : null,
  };

  const { ctx, evaluation } = planContext(input, today);
  if (evaluation.feasible.length === 0) {
    return {
      ok: false,
      error: indoor
        ? "Nothing in our catalog grows well with that light and pot size. Try bigger pots or adding a grow light."
        : "Nothing in our catalog can grow in that space this season. Try a different season or more sun.",
    };
  }

  const aiDesign = shouldUseAiDesign(input) ? await withTimeout(designWithAI(input, ctx, evaluation), 100_000) : null;
  let plan = buildPlan(input, aiDesign ?? designWithRules(input, evaluation, ctx), today);
  if (plan.plants.length === 0 && aiDesign) {
    plan = buildPlan(input, designWithRules(input, evaluation, ctx), today);
  }
  if (plan.plants.length === 0) {
    return {
      ok: false,
      error: indoor
        ? "We couldn't fit any plants into those pots. Try bigger pots or a few more of them."
        : "We couldn't fit any plants into that space. Try adding a bed or containers.",
    };
  }
  return { ok: true, input, plan };
}

const GARDEN_NAMES: Record<Goal, string> = {
  salad: "Salad garden",
  salsa: "Salsa garden",
  herbs: "Herb garden",
  pizza: "Pizza garden",
  pollinators: "Pollinator garden",
  kids: "Kids' garden",
  "cooking-greens": "Greens garden",
  preserving: "Pantry garden",
  "low-maintenance": "Easy-care garden",
};

const INDOOR_NAMES: Partial<Record<Goal, string>> = {
  herbs: "Windowsill herb garden",
  salad: "Windowsill salad garden",
  "cooking-greens": "Indoor greens",
  kids: "Kids' windowsill garden",
  pizza: "Windowsill pizza herbs",
  salsa: "Windowsill salsa garden",
};

export function defaultGardenName(input: PlanInput): string {
  if (input.spaceType === "indoor") return (input.goals[0] && INDOOR_NAMES[input.goals[0]]) || "Indoor garden";
  const name = input.goals[0] ? GARDEN_NAMES[input.goals[0]] : null;
  if (!name) return input.season === "fall" ? `My fall ${input.year} garden` : `My ${input.year} garden`;
  return input.season === "fall" ? `Fall ${name.toLowerCase()} ${input.year}` : `${name} ${input.year}`;
}
