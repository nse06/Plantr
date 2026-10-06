import type { Climate, Plant, PlanSeason, PlantSchedule } from "./types";
import { addDays, addWeeks, diffDays, maxISO, minISO, mmddToISO } from "./dates";
import { parseZone } from "./climate";

/** How long each frost class keeps producing after the average first fall frost. */
const FROST_TOLERANCE_DAYS: Record<Plant["frost"], number> = {
  tender: 0,
  "half-hardy": 14,
  hardy: 42,
};

/** Fall plantings grow slower as days shorten; pad maturity by this much. */
const FALL_FACTOR_DAYS = 14;

/** Days needed after "today" to buy supplies before planting. */
const LEAD_DAYS = 3;

export interface SeasonContext {
  season: PlanSeason;
  year: number;
  today: string;
  climate: Climate;
  zoneNum: number;
  /** Last spring frost of the plan year. */
  lastFrost: string;
  /** First fall frost of the plan year. */
  firstFrost: string;
  /** Last spring frost of the following year (for overwintering crops). */
  nextLastFrost: string;
}

export function seasonContext(climate: Climate, season: PlanSeason, year: number, today: string): SeasonContext {
  return {
    season,
    year,
    today,
    climate,
    zoneNum: parseZone(climate.zone)?.num ?? 6,
    lastFrost: mmddToISO(year, climate.lastFrost),
    firstFrost: mmddToISO(year, climate.firstFrost),
    nextLastFrost: mmddToISO(year + 1, climate.lastFrost),
  };
}

export interface SeasonOption {
  season: PlanSeason;
  year: number;
  label: string;
  description: string;
}

/** Which plans make sense to offer on a given date. The first option is the default. */
export function seasonOptions(climate: Climate, today: string): SeasonOption[] {
  const year = Number(today.slice(0, 4));
  const lf = mmddToISO(year, climate.lastFrost);
  const ff = mmddToISO(year, climate.firstFrost);
  const options: SeasonOption[] = [];

  if (today <= addWeeks(lf, 10)) {
    const started = today > addWeeks(lf, 2);
    options.push({
      season: "spring",
      year,
      label: started ? `This summer (start now)` : `Spring ${year}`,
      description: started
        ? "Get warm-season crops in the ground right away."
        : "Our main season plan: spring crops first, summer crops after the last frost.",
    });
  }
  if (today >= addWeeks(lf, 4) && today <= addWeeks(ff, -7)) {
    options.push({
      season: "fall",
      year,
      label: `Fall ${year}`,
      description: climate.frostFree
        ? "Plant now for harvests through the mild winter months."
        : "Cool-weather crops that mature as the weather cools, plus garlic for next summer.",
    });
  }
  if (today > addWeeks(lf, -4)) {
    options.push({
      season: "spring",
      year: year + 1,
      label: `Spring ${year + 1}`,
      description: "Plan ahead. We'll remind you when it's time to start seeds and plant.",
    });
  }
  return options;
}

export type ScheduleResult =
  | { ok: true; schedule: PlantSchedule; mustBuyStarts: boolean }
  | { ok: false; reason: string };

function fail(reason: string): ScheduleResult {
  return { ok: false, reason };
}

/** True when the plant can be part of a fall plan at all (ignoring timing). */
export function fallEligible(plant: Plant, ctx: SeasonContext): boolean {
  if (plant.overwinter) return true;
  if (plant.perennial) return false;
  if (plant.season === "cool") return Boolean(plant.fall);
  // Warm-season annuals only work as a fall crop where autumn is long and mild.
  return ctx.zoneNum >= 9;
}

/**
 * Compute when to start, plant and harvest a plant for the given season.
 * Pure and deterministic: the same inputs always produce the same calendar.
 */
export function computeSchedule(plant: Plant, ctx: SeasonContext): ScheduleResult {
  return ctx.season === "spring" ? springSchedule(plant, ctx) : fallSchedule(plant, ctx);
}

function springSchedule(plant: Plant, ctx: SeasonContext): ScheduleResult {
  const { today, lastFrost: lf, firstFrost: ff } = ctx;
  if (plant.overwinter) {
    return fail(`${plant.name} is planted in fall and harvested the next summer. Add it to a fall plan.`);
  }
  const kill = addDays(ff, FROST_TOLERANCE_DAYS[plant.frost]);
  const warnings: string[] = [];
  let mustBuyStarts = false;

  let plantOut = addWeeks(lf, plant.plantOutWeeks);
  let startIndoors =
    plant.method === "transplant" && plant.indoorWeeks ? addWeeks(lf, -plant.indoorWeeks) : undefined;

  const earliest = addDays(today, LEAD_DAYS);
  if (plantOut < earliest) {
    const lateBy = diffDays(plantOut, today);
    if (plant.season === "cool" && !plant.perennial && lateBy > 28) {
      return fail(`It's too late in spring for ${plant.name}; it bolts in summer heat. It's a great fall crop instead.`);
    }
    plantOut = earliest;
    startIndoors = undefined;
    if (plant.method === "transplant") mustBuyStarts = true;
    if (lateBy > 7) warnings.push("You're past the ideal planting date. Plant as soon as you can.");
  }
  if (startIndoors && startIndoors < today) {
    startIndoors = undefined;
    mustBuyStarts = true;
  }

  const harvestStart = addDays(plantOut, plant.dtm);
  if (harvestStart > addDays(kill, -7)) {
    return fail(`Not enough frost-free days left for ${plant.name} to mature this season.`);
  }
  if (plant.frost === "tender" && diffDays(harvestStart, ff) < 21) {
    warnings.push("Your season is tight for this one. Choose a fast-maturing variety and plant on time.");
  }

  const successions: string[] = [];
  if (plant.succession) {
    const cutoff =
      plant.season === "cool" ? addWeeks(lf, 5) : addDays(ff, -(plant.dtm + 7 + FROST_TOLERANCE_DAYS[plant.frost]));
    let d = addWeeks(plantOut, plant.succession);
    while (d <= cutoff && successions.length < 4) {
      successions.push(d);
      d = addWeeks(d, plant.succession);
    }
  }

  const lastSow = successions.length ? successions[successions.length - 1] : plantOut;
  const harvestEnd = minISO(
    kill,
    maxISO(addWeeks(harvestStart, plant.harvestWeeks), addWeeks(addDays(lastSow, plant.dtm), plant.harvestWeeks)),
  );

  let fallSow: string | undefined;
  if (plant.fall && plant.season === "cool" && !ctx.climate.frostFree) {
    const d = addDays(ff, -(plant.dtm + FALL_FACTOR_DAYS));
    if (d > addWeeks(lf, 8)) fallSow = d;
  }

  return {
    ok: true,
    mustBuyStarts,
    schedule: {
      plantId: plant.id,
      startIndoors,
      plantOut,
      method: plant.method,
      harvestStart,
      harvestEnd: maxISO(harvestEnd, addDays(harvestStart, 7)),
      successions,
      fallSow,
      warnings,
    },
  };
}

function fallSchedule(plant: Plant, ctx: SeasonContext): ScheduleResult {
  const { today, firstFrost: ff } = ctx;
  if (!fallEligible(plant, ctx)) {
    if (plant.perennial) return fail(`${plant.name} is best planted in spring so it can settle in before winter.`);
    if (plant.season === "warm") return fail(`${plant.name} needs summer heat. Plant it next spring.`);
    return fail(`${plant.name} doesn't do well as a fall crop. Plant it in spring.`);
  }
  const earliest = addDays(today, LEAD_DAYS);
  const warnings: string[] = [];

  if (plant.overwinter) {
    // Garlic goes in around the first frost and is dug the following summer.
    const ideal = addDays(ff, 7);
    if (today > addDays(ff, 35)) return fail(`It's too late to plant ${plant.name} this year. Plant it next fall.`);
    const plantOut = maxISO(ideal, earliest);
    const harvestStart = addWeeks(ctx.nextLastFrost, 10);
    return {
      ok: true,
      mustBuyStarts: true,
      schedule: {
        plantId: plant.id,
        plantOut,
        method: plant.method,
        harvestStart,
        harvestEnd: addWeeks(harvestStart, plant.harvestWeeks),
        successions: [],
        warnings,
      },
    };
  }

  const kill = addDays(ff, FROST_TOLERANCE_DAYS[plant.frost]);
  const extra = plant.frost === "tender" ? 7 : 0;
  let plantOut = addDays(ff, -(plant.dtm + FALL_FACTOR_DAYS + extra));
  let startIndoors = plant.method === "transplant" ? addWeeks(plantOut, -6) : undefined;
  let mustBuyStarts = false;

  if (plantOut < earliest) {
    if (diffDays(plantOut, today) > 7) {
      warnings.push("It's getting late. Plant right away and keep row cover handy for cold nights.");
    }
    plantOut = earliest;
    startIndoors = undefined;
    if (plant.method === "transplant") mustBuyStarts = true;
  }
  if (startIndoors && startIndoors < today) {
    startIndoors = undefined;
    mustBuyStarts = true;
  }

  const harvestStart = addDays(plantOut, plant.dtm + 7);
  if (harvestStart > addDays(kill, -7)) {
    return fail(`Not enough time left before frost for ${plant.name} this fall.`);
  }

  const successions: string[] = [];
  if (plant.succession) {
    const cutoff = addDays(kill, -(plant.dtm + 7 + 7));
    let d = addWeeks(plantOut, plant.succession);
    while (d <= cutoff && successions.length < 2) {
      successions.push(d);
      d = addWeeks(d, plant.succession);
    }
  }
  const lastSow = successions.length ? successions[successions.length - 1] : plantOut;
  const harvestEnd = minISO(
    kill,
    maxISO(addWeeks(harvestStart, plant.harvestWeeks), addWeeks(addDays(lastSow, plant.dtm + 7), plant.harvestWeeks)),
  );

  return {
    ok: true,
    mustBuyStarts,
    schedule: {
      plantId: plant.id,
      startIndoors,
      plantOut,
      method: plant.method,
      harvestStart,
      harvestEnd: maxISO(harvestEnd, addDays(harvestStart, 7)),
      successions,
      warnings,
    },
  };
}
