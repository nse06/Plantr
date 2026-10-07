import type { Design, Goal, Plant, PlanInput, PlantSchedule, PlantSelection } from "./types";
import { GOALS, PLANTS, PLANTS_BY_ID } from "./plants";
import { computeSchedule, type SeasonContext } from "./schedule";
import { cellsNeeded, maxPotGallons, plantableSqFt, plantsPerPot, potCount } from "./layout";
import { seasonLengthDays } from "./climate";
import {
  indoorCheck,
  indoorDefaultQuantity,
  indoorDifficulty,
  indoorLight,
  indoorSummary,
  indoorTips,
  indoorVarieties,
  isIndoor,
  plantsPerIndoorPot,
} from "./indoor";

export interface Candidate {
  plant: Plant;
  schedule: PlantSchedule;
  mustBuyStarts: boolean;
  warnings: string[];
}

export interface CatalogEvaluation {
  feasible: Candidate[];
  infeasible: { plant: Plant; reason: string }[];
}

/** Check every catalog plant against season timing, sun and available space. */
export function evaluateCatalog(input: PlanInput, ctx: SeasonContext): CatalogEvaluation {
  if (isIndoor(input)) return evaluateIndoor(input, ctx);
  const feasible: Candidate[] = [];
  const infeasible: { plant: Plant; reason: string }[] = [];
  const hasBeds = input.areas.some((a) => a.kind === "bed");
  const maxGal = maxPotGallons(input.areas);

  for (const plant of PLANTS) {
    const warnings: string[] = [];
    if (plant.indoorOnly) {
      infeasible.push({ plant, reason: `${plant.name} are grown indoors. Plan an indoor garden to grow them.` });
      continue;
    }
    if (input.sun === "shade" && plant.sun === "full") {
      infeasible.push({ plant, reason: `${plant.name} needs at least 6 hours of direct sun.` });
      continue;
    }
    if (!hasBeds) {
      if (!plant.pot) {
        infeasible.push({ plant, reason: `${plant.name} sprawls too much for containers.` });
        continue;
      }
      if (maxGal > 0 && plantsPerPot(plant, maxGal) === 0) {
        infeasible.push({
          plant,
          reason: `${plant.name} needs at least a ${plant.pot.gal}-gallon container.`,
        });
        continue;
      }
    }
    const result = computeSchedule(plant, ctx);
    if (!result.ok) {
      infeasible.push({ plant, reason: result.reason });
      continue;
    }
    if (input.sun === "partial" && plant.sun === "full") {
      warnings.push("Prefers 6+ hours of sun, so expect a smaller harvest in partial sun.");
    }
    if (input.sun === "shade") warnings.push("Shade slows growth. Leafy greens and herbs cope best.");
    feasible.push({
      plant,
      schedule: { ...result.schedule, warnings: [...result.schedule.warnings, ...warnings] },
      mustBuyStarts: result.mustBuyStarts,
      warnings,
    });
  }
  return { feasible, infeasible };
}

/** Indoor gardens: light and pot size decide what works, and every plant can start now. */
function evaluateIndoor(input: PlanInput, ctx: SeasonContext): CatalogEvaluation {
  const feasible: Candidate[] = [];
  const infeasible: { plant: Plant; reason: string }[] = [];
  const maxGal = maxPotGallons(input.areas);
  const wanted = new Set([...input.wants, ...plantsFromNotes(input.notes).named]);
  for (const plant of PLANTS) {
    const check = indoorCheck(plant, input, maxGal, ctx.today, wanted.has(plant.id));
    if (!check.ok) {
      infeasible.push({ plant, reason: check.reason });
      continue;
    }
    const result = computeSchedule(plant, ctx);
    if (!result.ok) {
      infeasible.push({ plant, reason: result.reason });
      continue;
    }
    feasible.push({
      plant,
      schedule: { ...result.schedule, warnings: check.warnings },
      mustBuyStarts: false,
      warnings: check.warnings,
    });
  }
  return { feasible, infeasible };
}

/** The variety we suggest when nobody picked one. */
export function defaultVariety(plant: Plant, input: PlanInput): string {
  if (!isIndoor(input)) return plant.varieties[0] ?? "";
  // Regrown from grocery-store scraps: there's no variety to choose.
  return plant.indoor?.start === "scraps" ? "" : (indoorVarieties(plant)[0] ?? "");
}

/** Plants per pot for this garden (indoor pots follow the indoor rules). */
function perPot(plant: Plant, input: PlanInput): number {
  const gal = maxPotGallons(input.areas);
  return isIndoor(input) ? plantsPerIndoorPot(plant, gal) : plantsPerPot(plant, gal);
}

const MIN_QTY: Record<string, number> = { "sweet-corn": 16 };

/** A sensible starting quantity for a household. */
export function defaultQuantity(plant: Plant, input: PlanInput): number {
  if (isIndoor(input)) return indoorDefaultQuantity(plant, input, maxPotGallons(input.areas));
  const household = input.household;
  const raw = plant.perPerson * Math.max(1, household);
  let qty: number;
  if (plant.perSqFt >= 1) {
    const squares = Math.max(1, Math.round(raw / plant.perSqFt));
    qty = squares * plant.perSqFt;
  } else {
    qty = Math.max(1, Math.round(raw));
  }
  if (plant.perennial) qty = Math.min(qty, plant.id === "strawberry" ? 12 : 2);
  return Math.max(qty, MIN_QTY[plant.id] ?? 1);
}

export function minimumQuantity(plant: Plant): number {
  return MIN_QTY[plant.id] ?? 1;
}

/** Space units: square feet in beds, or pots when the garden is containers only. */
export function spaceUnits(plant: Plant, qty: number, input: PlanInput): number {
  const hasBeds = input.areas.some((a) => a.kind === "bed");
  if (hasBeds) return cellsNeeded(plant, qty);
  const per = perPot(plant, input);
  return per > 0 ? Math.ceil(qty / per) : Infinity;
}

/** In container-only gardens, plant in whole pots (no pot with a single lonely spinach). */
export function roundToPots(plant: Plant, qty: number, input: PlanInput): number {
  if (input.areas.some((a) => a.kind === "bed")) return qty;
  const per = perPot(plant, input);
  if (per <= 1) return qty;
  return Math.max(per, Math.round(qty / per) * per);
}

export function capacityUnits(input: PlanInput): number {
  const sq = plantableSqFt(input.areas);
  // Pots count as roughly one square foot each when mixed with beds.
  return sq > 0 ? sq + potCount(input.areas) : potCount(input.areas);
}

const KEYWORDS: [RegExp, string[]][] = [
  [/spic|hot sauce|heat|jalape|chil/i, ["hot-pepper"]],
  [/salsa|taco|mexican/i, ["tomato", "hot-pepper", "cilantro", "scallions"]],
  [/pickl/i, ["cucumber", "dill"]],
  [/pesto|italian|caprese/i, ["basil", "paste-tomato"]],
  [/tea|mojito/i, ["mint"]],
  [/smoothie|juic/i, ["kale", "spinach"]],
  [/stir.?fry|asian/i, ["bok-choy", "scallions", "snap-peas"]],
  [/bee|butterfl|pollinat/i, ["zinnia", "marigold", "calendula"]],
  [/kid|child|grand/i, ["cherry-tomato", "snap-peas", "sunflower", "radish", "strawberry"]],
  [/berr/i, ["strawberry"]],
  [/sauce|can(ning)?\b|preserv/i, ["paste-tomato"]],
  [/halloween|jack.?o/i, ["pumpkin"]],
];

/** Matches a plant name and its plural ("tomatoes", "strawberries", "beets"). */
function namePattern(name: string): RegExp {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let plural = `${escaped}s?`;
  if (/[^aeiou]y$/.test(name)) plural = `(?:${escaped}|${escaped.slice(0, -1)}ies)`;
  else if (/o$/.test(name)) plural = `${escaped}(?:es|s)?`;
  return new RegExp(`\\b${plural}\\b`, "i");
}

/** True when the text mentions the plant by any of its common names ("green onions", "chard"). */
export function mentionsPlant(text: string, p: Plant): boolean {
  const names = [p.name.toLowerCase(), p.id.replace(/-/g, " ")];
  if (p.id === "scallions") names.push("scallion", "green onion");
  if (p.id === "snap-peas") names.push("peas", "pea");
  if (p.id === "sweet-corn") names.push("corn");
  if (p.id === "swiss-chard") names.push("chard");
  if (p.id === "hot-pepper") names.push("jalapeño", "jalapeno");
  const lower = text.toLowerCase();
  return names.some((n) => namePattern(n).test(lower));
}

/** Plant ids mentioned by name or implied by keywords in the user's free-text notes. */
export function plantsFromNotes(notes: string): { named: string[]; implied: string[] } {
  const named = PLANTS.filter((p) => mentionsPlant(notes, p)).map((p) => p.id);
  const implied = new Set<string>();
  for (const [re, ids] of KEYWORDS) if (re.test(notes)) ids.forEach((id) => implied.add(id));
  return { named, implied: [...implied].filter((id) => !named.includes(id)) };
}

/** Forgiving indoor crops for a first windowsill garden. */
const INDOOR_FAVORITES = new Set(["basil", "parsley", "chives", "mint", "lettuce", "microgreens", "scallions"]);

const BEGINNER_FAVORITES = new Set([
  "cherry-tomato",
  "basil",
  "lettuce",
  "bush-beans",
  "zucchini",
  "radish",
  "marigold",
  "kale",
  "cucumber",
  "snap-peas",
  "swiss-chard",
  "bell-pepper",
  "spinach",
  "garlic",
]);

/** Limit near-duplicates unless the user asked for them. */
const GROUPS: { ids: string[]; max: number }[] = [
  { ids: ["tomato", "cherry-tomato", "paste-tomato"], max: 2 },
  { ids: ["bush-beans", "pole-beans"], max: 1 },
  { ids: ["winter-squash", "pumpkin"], max: 1 },
  { ids: ["cantaloupe", "watermelon"], max: 1 },
  { ids: ["marigold", "nasturtium", "zinnia", "calendula", "sunflower"], max: 2 },
];

function score(c: Candidate, input: PlanInput, wanted: Set<string>, implied: Set<string>): number {
  const p = c.plant;
  let s = 0;
  if (wanted.has(p.id)) s += 100;
  if (implied.has(p.id)) s += 18;
  const hits = p.goals.filter((g) => input.goals.includes(g)).length;
  s += hits * 12;
  const indoor = isIndoor(input);
  const favorites = indoor ? INDOOR_FAVORITES : BEGINNER_FAVORITES;
  if (input.goals.length === 0 && wanted.size === 0 && favorites.has(p.id)) s += 10;
  const difficulty = indoor ? indoorDifficulty(p) : p.difficulty;
  if (input.experience === "new") s -= difficulty === 3 ? 25 : difficulty === 2 ? 6 : 0;
  if (input.experience === "some" && difficulty === 3) s -= 8;
  if (input.time === "minimal") {
    if (p.goals.includes("low-maintenance")) s += 6;
    if (difficulty >= 2) s -= 6;
    if (p.succession) s -= 2;
  }
  if (indoor) {
    // Plants with light to spare do better than ones right at the edge.
    if (p.indoor && p.indoor.light < indoorLight(input.indoor)) s += 3;
    if (input.indoor?.pets && p.petCaution && !wanted.has(p.id)) s -= 30;
  } else {
    if (input.sun === "partial") s += p.sun === "partial" ? 5 : -14;
    if (input.sun === "shade") s += p.category === "herb" || p.sun === "partial" ? 4 : -10;
  }
  // Space hogs need to earn their place in small gardens.
  const cap = capacityUnits(input);
  const units = spaceUnits(p, defaultQuantity(p, input), input);
  if (cap > 0 && units / cap > 0.35 && !wanted.has(p.id)) s -= 15;
  if (c.warnings.length && !wanted.has(p.id)) s -= 3;
  return s;
}

function targetCropCount(input: PlanInput): number {
  const cap = capacityUnits(input);
  const hasBeds = input.areas.some((a) => a.kind === "bed");
  if (!hasBeds) return Math.max(1, Math.min(cap, 10));
  if (cap <= 8) return 4;
  if (cap <= 16) return 6;
  if (cap <= 32) return 8;
  if (cap <= 64) return 10;
  if (cap <= 120) return 13;
  return 16;
}

function conflicts(a: Plant, b: Plant): boolean {
  return a.avoid.includes(b.id) || b.avoid.includes(a.id);
}

function reasonFor(c: Candidate, input: PlanInput, wanted: Set<string>, implied: Set<string>): string {
  const p = c.plant;
  const parts: string[] = [];
  if (wanted.has(p.id)) parts.push("You asked for it");
  const goalNames = p.goals
    .filter((g) => input.goals.includes(g))
    .map((g) => GOALS.find((x) => x.id === g)?.label.toLowerCase())
    .filter(Boolean);
  if (goalNames.length) parts.push(`fits your ${goalNames.slice(0, 2).join(" and ")} goal${goalNames.length > 1 ? "s" : ""}`);
  else if (implied.has(p.id)) parts.push("matches what you told us you like");
  if (isIndoor(input)) {
    if (indoorDifficulty(p) === 1 && input.experience !== "experienced") parts.push("easy to grow indoors");
    if (p.indoor?.start === "scraps") parts.push("regrows from grocery-store scraps");
    if (p.indoor?.resow) parts.push(`ready in about ${Math.round(p.indoor.dtm / 7) || 1} week${p.indoor.dtm >= 11 ? "s" : ""}, so re-sow every ${p.indoor.resow} weeks`);
    else if (p.category === "herb") parts.push("keeps producing for months if you snip it often");
  } else {
    if (p.difficulty === 1 && input.experience !== "experienced") parts.push("very forgiving for beginners");
    if (input.sun !== "full" && p.sun === "partial") parts.push("happy with less than full sun");
    if (p.perennial) parts.push("comes back every year");
    if (p.succession) parts.push(`quick to grow, so you can re-sow every ${p.succession} weeks`);
  }
  if (parts.length === 0) parts.push(p.yield);
  const text = parts.join("; ");
  return text.charAt(0).toUpperCase() + text.slice(1) + ".";
}

/** The crops that most define each goal; they get a boost so every goal is well represented. */
const GOAL_CORE: Record<Goal, string[]> = {
  salad: ["lettuce", "cherry-tomato", "cucumber", "radish", "spinach", "arugula", "microgreens"],
  salsa: ["tomato", "paste-tomato", "hot-pepper", "bell-pepper", "cilantro", "scallions"],
  herbs: ["basil", "parsley", "chives", "thyme", "oregano", "cilantro"],
  pizza: ["paste-tomato", "basil", "oregano", "bell-pepper", "arugula"],
  pollinators: ["zinnia", "marigold", "calendula", "sunflower", "nasturtium"],
  kids: ["cherry-tomato", "snap-peas", "radish", "sunflower", "strawberry", "pumpkin", "carrot", "microgreens"],
  "cooking-greens": ["kale", "swiss-chard", "spinach", "broccoli", "bok-choy"],
  preserving: ["paste-tomato", "cucumber", "bush-beans", "winter-squash", "hot-pepper"],
  "low-maintenance": ["swiss-chard", "kale", "bush-beans", "cherry-tomato", "zucchini", "garlic"],
};

/** Plants we never scale past this many per household, however much space there is. */
function maxQuantity(p: Plant, input: PlanInput): number {
  const def = defaultQuantity(p, input);
  if (isIndoor(input)) return def * 2;
  if (p.id === "mint") return 1;
  if (p.perennial && p.id !== "strawberry") return Math.max(def, 2);
  if (p.category === "herb") return Math.max(def, p.perSqFt >= 1 ? p.perSqFt * 2 : 2);
  if (p.id === "zucchini") return Math.max(def, Math.ceil(input.household / 2) + 1);
  // Big plants (tomatoes, squash, melons) are very productive: a little extra goes a long way.
  if (p.perSqFt < 1) return Math.max(def, Math.ceil(def * 1.5));
  // One-per-square plants (peppers, kale, broccoli, strawberries): a couple more at most.
  if (p.perSqFt <= 2) return def + 2;
  // Dense square-foot crops (greens, roots, beans): up to double.
  return Math.max(def * 2, def + p.perSqFt);
}

/**
 * The rule-based designer: used when AI is unavailable, and as a safety net that keeps the
 * AI honest (feasibility and space are always enforced by the engine, not the model).
 */
/** Feasible plants, best first, scored against the user's goals, notes, experience, time and space. */
export function rankCandidates(
  input: PlanInput,
  evaluation: CatalogEvaluation,
): { ranked: { c: Candidate; s: number }[]; wanted: Set<string>; implied: Set<string> } {
  const notes = plantsFromNotes(input.notes);
  const wanted = new Set([...input.wants, ...notes.named]);
  const implied = new Set(notes.implied);
  const core = new Set(input.goals.flatMap((g) => GOAL_CORE[g] ?? []));
  const ranked = evaluation.feasible
    .map((c) => ({ c, s: score(c, input, wanted, implied) + (core.has(c.plant.id) ? 10 : 0) }))
    .sort((a, b) => b.s - a.s || a.c.plant.difficulty - b.c.plant.difficulty);
  return { ranked, wanted, implied };
}

export function designWithRules(input: PlanInput, evaluation: CatalogEvaluation, ctx: SeasonContext): Design {
  const { ranked, wanted, implied } = rankCandidates(input, evaluation);
  const indoor = isIndoor(input);

  const capacity = capacityUnits(input);
  const target = targetCropCount(input);
  // Windowsill gardens are mostly herbs, and that's fine.
  const herbCap =
    indoor || (input.goals.length === 1 && input.goals[0] === "herbs") ? target : Math.max(2, Math.ceil(target / 3));
  let used = 0;
  const chosen: Candidate[] = [];
  const selections: PlantSelection[] = [];
  const skipped: Design["skipped"] = [];

  const tryAdd = (c: Candidate, s: number): boolean => {
    const p = c.plant;
    const isWanted = wanted.has(p.id);
    if (chosen.includes(c)) return false;
    if (!isWanted) {
      if (chosen.length >= target) return false;
      if (s < 0 && chosen.length >= 3) return false;
      if (chosen.some((x) => conflicts(x.plant, p))) return false;
      const group = GROUPS.find((g) => g.ids.includes(p.id));
      if (group && chosen.filter((x) => group.ids.includes(x.plant.id)).length >= group.max) return false;
      if (p.category === "herb" && chosen.filter((x) => x.plant.category === "herb").length >= herbCap) return false;
    }
    let qty = roundToPots(p, defaultQuantity(p, input), input);
    const left = capacity - used;
    const min = minimumQuantity(p);
    while (qty > min && spaceUnits(p, qty, input) > left) {
      qty = p.perSqFt >= 1 && qty > p.perSqFt ? qty - p.perSqFt : qty - 1;
    }
    qty = Math.min(qty, roundToPots(p, qty, input));
    const units = spaceUnits(p, qty, input);
    if (units > left) {
      if (isWanted) skipped.push({ name: p.name, reason: "There wasn't room for it alongside everything else." });
      return false;
    }
    used += units;
    chosen.push(c);
    selections.push({ plantId: p.id, quantity: qty, variety: defaultVariety(p, input), reason: reasonFor(c, input, wanted, implied) });
    return true;
  };

  // 1. Everything the user explicitly asked for.
  for (const { c, s } of ranked) if (wanted.has(c.plant.id)) tryAdd(c, s);
  // 2. Take turns across goals so a salsa + herbs garden isn't all herbs.
  for (let round = 0; round < target && chosen.length < target; round++) {
    let progressed = false;
    for (const g of input.goals) {
      const next = ranked.find(({ c }) => !chosen.includes(c) && c.plant.goals.includes(g) && tryAdd(c, 0));
      if (next) progressed = true;
    }
    if (!progressed) break;
  }
  // 3. Fill the rest by overall score.
  for (const { c, s } of ranked) {
    if (chosen.length >= target) break;
    tryAdd(c, s);
  }

  // 4. A few flowers pull in pollinators and beneficial insects. Add one if there's room.
  if (!indoor && !chosen.some((c) => c.plant.category === "flower") && capacity - used >= 1 && capacity >= 12) {
    const prefer = ctx.season === "fall" ? ["calendula"] : ["marigold", "nasturtium", "zinnia", "calendula"];
    const flower = prefer
      .map((id) => evaluation.feasible.find((c) => c.plant.id === id))
      .find((c): c is Candidate => Boolean(c) && !chosen.some((x) => conflicts(x.plant, c!.plant)));
    if (flower) {
      const qty = Math.min(defaultQuantity(flower.plant, { ...input, household: 1 }), flower.plant.perSqFt >= 1 ? flower.plant.perSqFt : 1);
      const units = spaceUnits(flower.plant, qty, input);
      if (units <= capacity - used) {
        used += units;
        chosen.push(flower);
        selections.push({
          plantId: flower.plant.id,
          quantity: qty,
          variety: flower.plant.varieties[0] ?? "",
          reason: "A few flowers bring in pollinators and pest-eating insects: free help for your vegetables.",
        });
      }
    }
  }

  // 5. Grow quantities until the space is comfortably full.
  growToFill(selections, input, used);

  for (const { plant, reason } of evaluation.infeasible) {
    if (wanted.has(plant.id)) skipped.push({ name: plant.name, reason });
  }

  return {
    selections,
    skipped,
    summary: indoor ? indoorSummary(input, selections) : rulesSummary(input, ctx, selections),
    tips: indoor ? indoorTips(input, ctx.today) : rulesTips(input, ctx),
    source: "rules",
  };
}

function rulesSummary(input: PlanInput, ctx: SeasonContext, selections: PlantSelection[]): string {
  const names = selections.slice(0, 4).map((s) => PLANTS_BY_ID[s.plantId]?.name.toLowerCase());
  const more = selections.length > 4 ? ` and ${selections.length - 4} more` : "";
  const season = ctx.season === "fall" ? `fall ${ctx.year}` : `the ${ctx.year} season`;
  const goals = input.goals
    .slice(0, 2)
    .map((g: Goal) => GOALS.find((x) => x.id === g)?.label.toLowerCase())
    .join(" and ");
  return (
    `A ${selections.length}-crop plan for ${season} in zone ${input.climate.zone}` +
    (goals ? `, built around your ${goals} goals` : "") +
    `: ${names.join(", ")}${more}. Everything is spaced to fit your space, with tall crops on the north side, ` +
    `and every date is timed to your local frost dates.`
  );
}

function rulesTips(input: PlanInput, ctx: SeasonContext): string[] {
  const tips: string[] = [];
  const seasonDays = seasonLengthDays(input.climate);
  if (input.experience === "new") {
    tips.push("Visit the garden for five minutes most days. Catching thirsty plants and pests early is most of the battle.");
  }
  if (!input.areas.some((a) => a.kind === "bed")) {
    tips.push("Containers dry out fast. In summer, check daily and water until it runs out the bottom.");
  }
  if (input.sun === "partial") {
    tips.push("With 4–6 hours of sun, put your sun-lovers in the brightest spot and leafy greens where it's shadier.");
  }
  if (!ctx.climate.frostFree && seasonDays < 140) {
    tips.push("Your frost-free season is short. Nursery starts and early varieties give you a head start.");
  }
  if (ctx.zoneNum >= 9) {
    tips.push("Summer heat is the big challenge here. Water early in the morning and give greens afternoon shade.");
  }
  if (ctx.season === "fall") {
    tips.push("Keep a roll of row cover handy. It adds weeks of harvest when the first frosts arrive.");
  }
  tips.push("Water the soil, not the leaves: deep soakings once or twice a week beat a daily sprinkle.");
  tips.push("Mulch bare soil with straw or shredded leaves to hold moisture and smother weeds.");
  return tips.slice(0, 4);
}

/**
 * Clean up a design from any source: drop unknown or infeasible plants (moving them to
 * "skipped" with a reason), merge duplicates, clamp quantities, and make sure plants the
 * user explicitly asked for aren't silently dropped.
 */
export function normalizeDesign(design: Design, input: PlanInput, evaluation: CatalogEvaluation): Design {
  const feasible = new Map(evaluation.feasible.map((c) => [c.plant.id, c]));
  const infeasible = new Map(evaluation.infeasible.map((x) => [x.plant.id, x.reason]));
  const merged = new Map<string, PlantSelection>();
  const skipped = [...design.skipped];

  for (const sel of design.selections) {
    const plant = PLANTS_BY_ID[sel.plantId];
    if (!plant) continue;
    if (!feasible.has(plant.id)) {
      const reason = infeasible.get(plant.id) ?? "Not a good fit for this season.";
      if (!skipped.some((s) => s.name === plant.name)) skipped.push({ name: plant.name, reason });
      continue;
    }
    const qty = roundToPots(plant, Math.max(minimumQuantity(plant), Math.min(200, Math.round(sel.quantity))), input);
    const prev = merged.get(plant.id);
    if (prev) prev.quantity += qty;
    else merged.set(plant.id, { ...sel, quantity: qty, variety: sel.variety || defaultVariety(plant, input) });
  }

  const notes = plantsFromNotes(input.notes);
  for (const id of new Set([...input.wants, ...notes.named])) {
    const plant = PLANTS_BY_ID[id];
    if (!plant || merged.has(id) || skipped.some((s) => s.name === plant.name)) continue;
    if (feasible.has(id)) {
      merged.set(id, {
        plantId: id,
        quantity: roundToPots(plant, defaultQuantity(plant, input), input),
        variety: defaultVariety(plant, input),
        reason: "You asked for it.",
      });
    } else {
      skipped.push({ name: plant.name, reason: infeasible.get(id) ?? "Not a good fit for this season." });
    }
  }

  return { ...design, selections: [...merged.values()], skipped };
}

/**
 * Trim a design that asks for more room than the space has: shrink the biggest non-requested
 * crops first, and drop a crop entirely only when it's already at its minimum.
 */
export function fitDesignToSpace(design: Design, input: PlanInput): Design {
  const capacity = capacityUnits(input);
  const wanted = new Set([...input.wants, ...plantsFromNotes(input.notes).named]);
  const selections = design.selections.map((s) => ({ ...s }));
  const skipped = [...design.skipped];
  const units = () =>
    selections.reduce((n, s) => n + spaceUnits(PLANTS_BY_ID[s.plantId], s.quantity, input), 0);

  let guard = 500;
  while (units() > capacity && selections.length && guard-- > 0) {
    // Shrink the most space-hungry unrequested crop; requested crops shrink last.
    const order = [...selections].sort((a, b) => {
      const wa = wanted.has(a.plantId) ? 1 : 0;
      const wb = wanted.has(b.plantId) ? 1 : 0;
      if (wa !== wb) return wa - wb;
      return (
        spaceUnits(PLANTS_BY_ID[b.plantId], b.quantity, input) - spaceUnits(PLANTS_BY_ID[a.plantId], a.quantity, input)
      );
    });
    const target = order[0];
    const p = PLANTS_BY_ID[target.plantId];
    const pot = input.areas.some((a) => a.kind === "bed") ? 0 : perPot(p, input);
    const step = pot >= 1 ? Math.min(pot, target.quantity) : p.perSqFt >= 1 && target.quantity > p.perSqFt ? p.perSqFt : 1;
    if (target.quantity - step >= minimumQuantity(p)) {
      target.quantity -= step;
    } else {
      selections.splice(selections.indexOf(target), 1);
      skipped.push({ name: p.name, reason: "There wasn't room for it alongside everything else." });
    }
  }
  return { ...design, selections, skipped };
}

/**
 * Grow quantities until the space is comfortably full (~90%). Square-foot crops (greens,
 * beans, roots) grow first, a square at a time; big plants only get a modest bump, and only
 * when the garden would otherwise look half empty. Mutates the selections.
 */
export function growToFill(selections: PlantSelection[], input: PlanInput, alreadyUsed?: number): void {
  const capacity = capacityUnits(input);
  let used =
    alreadyUsed ?? selections.reduce((n, s) => n + spaceUnits(PLANTS_BY_ID[s.plantId], s.quantity, input), 0);
  // Windowsills are small: fill every pot rather than leave one empty.
  const fill = isIndoor(input) ? 1 : 0.9;
  for (const bigPlants of [false, true]) {
    const goal = Math.floor(capacity * (bigPlants ? 0.7 : fill));
    let grew = true;
    while (used < goal && grew) {
      grew = false;
      for (const sel of selections) {
        const p = PLANTS_BY_ID[sel.plantId];
        if (!p || p.category === "flower" || used >= goal || p.perSqFt < 1 !== bigPlants) continue;
        const per = input.areas.some((a) => a.kind === "bed") ? 0 : perPot(p, input);
        // In pots, grow a whole pot at a time; in beds, a square foot at a time.
        const step = per >= 1 ? per : p.perSqFt >= 1 ? p.perSqFt : 1;
        const next = sel.quantity + step;
        if (next > Math.max(maxQuantity(p, input), per)) continue;
        const delta = spaceUnits(p, next, input) - spaceUnits(p, sel.quantity, input);
        if (used + delta > capacity) continue;
        sel.quantity = next;
        used += delta;
        grew = true;
      }
    }
  }
}

/** Space units a design asks for. */
export function designUnits(design: Design, input: PlanInput): number {
  return design.selections.reduce((n, s) => n + spaceUnits(PLANTS_BY_ID[s.plantId], s.quantity, input), 0);
}

/**
 * Windowsills are small, so an empty pot is a wasted one. When a design leaves pots free
 * (often because the engine dropped a pick that can't work), add the next-best plants, one pot
 * each, then grow what's there. Skips anything the design deliberately left out. Mutates it.
 */
export function fillSparePots(design: Design, input: PlanInput, evaluation: CatalogEvaluation): void {
  const capacity = capacityUnits(input);
  let used = designUnits(design, input);
  if (used >= capacity) return;
  const { ranked, wanted, implied } = rankCandidates(input, evaluation);
  const skipped = new Set(design.skipped.map((s) => s.name.toLowerCase()));
  for (const { c, s } of ranked) {
    if (used >= capacity) break;
    const p = c.plant;
    if (s < 0 || skipped.has(p.name.toLowerCase()) || design.selections.some((x) => x.plantId === p.id)) continue;
    const qty = Math.max(1, perPot(p, input));
    const units = spaceUnits(p, qty, input);
    if (used + units > capacity) continue;
    design.selections.push({ plantId: p.id, quantity: qty, variety: defaultVariety(p, input), reason: reasonFor(c, input, wanted, implied) });
    used += units;
  }
  growToFill(design.selections, input, used);
}

/** The plan summary and tips we write ourselves, used when the AI's no longer match the plan. */
export function templateText(input: PlanInput, ctx: SeasonContext, selections: PlantSelection[]): { summary: string; tips: string[] } {
  return isIndoor(input)
    ? { summary: indoorSummary(input, selections), tips: indoorTips(input, ctx.today) }
    : { summary: rulesSummary(input, ctx, selections), tips: rulesTips(input, ctx) };
}
