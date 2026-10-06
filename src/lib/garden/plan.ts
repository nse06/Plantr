import type { Design, GardenPlan, PlanInput, PlannedPlant } from "./types";
import { getPlant, spacingLabel } from "./plants";
import { seasonContext, type SeasonContext } from "./schedule";
import { evaluateCatalog, fitDesignToSpace, normalizeDesign, type CatalogEvaluation, type Candidate } from "./recommend";
import { layoutGarden, plantableSqFt, potCount } from "./layout";
import { buildTasks } from "./tasks";
import { buildShopping } from "./shopping";
import { minISO } from "./dates";

export function planContext(input: PlanInput, today: string): { ctx: SeasonContext; evaluation: CatalogEvaluation } {
  const ctx = seasonContext(input.climate, input.season, input.year, today);
  return { ctx, evaluation: evaluateCatalog(input, ctx) };
}

function acquireFor(c: Candidate, input: PlanInput): "seeds" | "starts" {
  const p = c.plant;
  if (p.overwinter || p.id === "potato" || p.id === "strawberry") return "starts";
  if (p.method === "direct") return "seeds";
  if (c.mustBuyStarts || !c.schedule.startIndoors) return "starts";
  if (p.perennial) return "starts";
  if (input.experience === "experienced") return "seeds";
  return p.buyStarts ? "starts" : "seeds";
}

/**
 * Turn a design (what to grow and how much) into a complete, buildable plan: layout,
 * calendar, tasks and shopping list. Space and timing constraints always win over the design.
 */
export function buildPlan(input: PlanInput, rawDesign: Design, today: string): GardenPlan {
  const { ctx, evaluation } = planContext(input, today);
  const design = fitDesignToSpace(normalizeDesign(rawDesign, input, evaluation), input);
  const candidates = new Map(evaluation.feasible.map((c) => [c.plant.id, c]));

  const { layouts, placed } = layoutGarden(
    input.areas,
    design.selections.map((s) => ({ plantId: s.plantId, quantity: s.quantity })),
  );

  const skipped = [...design.skipped];
  const plants: PlannedPlant[] = [];
  for (const sel of design.selections) {
    const c = candidates.get(sel.plantId);
    if (!c) continue;
    const n = placed[sel.plantId] ?? 0;
    if (n === 0) {
      skipped.push({
        name: c.plant.name,
        reason: "We ran out of room for it. A bigger bed or an extra container would fit it.",
      });
      continue;
    }
    const plant = getPlant(sel.plantId);
    const acquire = acquireFor(c, input);
    // Nursery starts skip the indoor seed-starting step entirely.
    const base = acquire === "starts" ? { ...c.schedule, startIndoors: undefined } : c.schedule;
    plants.push({
      plantId: plant.id,
      name: plant.name,
      emoji: plant.emoji,
      variety: sel.variety,
      quantity: n,
      placed: n,
      spacing: spacingLabel(plant),
      reason: sel.reason,
      schedule:
        n < sel.quantity
          ? { ...base, warnings: [...base.warnings, `Only ${n} of the ${sel.quantity} planned fit in your space.`] }
          : base,
      acquire,
    });
  }

  // If something only partly fit, the layout reflects what was actually placed.
  const tasks = buildTasks(plants, input, ctx);
  const shopping = buildShopping(plants, input, layouts);

  const usedSqFt = layouts.reduce(
    (n, l) => (l.kind === "bed" ? n + l.cells.reduce((m, c) => (c.plantId ? m + c.w * c.h : m), 0) : n),
    0,
  );
  const firstPlanting = plants.length
    ? minISO(...plants.map((p) => p.schedule.startIndoors ?? p.schedule.plantOut))
    : null;
  const firstHarvest = plants.length ? minISO(...plants.map((p) => p.schedule.harvestStart)) : null;

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    season: input.season,
    year: input.year,
    summary: design.summary,
    tips: design.tips,
    skipped: dedupeSkipped(skipped),
    plants,
    layouts,
    tasks,
    shopping,
    stats: {
      growingSqFt: plantableSqFt(input.areas) + potCount(input.areas),
      usedSqFt,
      plantCount: plants.reduce((n, p) => n + p.quantity, 0),
      firstPlanting,
      firstHarvest,
      estCost: Math.round(shopping.reduce((n, i) => n + i.estCost, 0)),
    },
    designSource: design.source,
  };
}

function dedupeSkipped(list: { name: string; reason: string }[]) {
  const seen = new Set<string>();
  return list.filter((s) => {
    const key = s.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
