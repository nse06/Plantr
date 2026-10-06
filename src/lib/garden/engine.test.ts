import { describe, expect, it } from "vitest";
import type { Area, PlanInput } from "./types";
import { buildClimate, frostDatesForZone, lookupZip3, parseZone } from "./climate";
import { addDays, diffDays, fmtShort, nextSaturday, startOfWeek } from "./dates";
import { computeSchedule, seasonContext, seasonOptions } from "./schedule";
import { getPlant, PLANTS, PLANT_ABBR, PLANT_COLORS } from "./plants";
import { cellsNeeded, layoutGarden, plantableSqFt } from "./layout";
import { designWithRules, evaluateCatalog, plantsFromNotes } from "./recommend";
import { buildPlan, planContext } from "./plan";

const bed = (w: number, l: number, raised = true, id = "b1"): Area => ({
  kind: "bed",
  id,
  name: "Bed",
  widthFt: w,
  lengthFt: l,
  raised,
});

function makeInput(over: Partial<PlanInput> = {}): PlanInput {
  const climate = buildClimate("20001", "7b", "DC", "estimate");
  return {
    zip: "20001",
    climate,
    spaceType: "raised-bed",
    areas: [bed(4, 8)],
    bedsReady: false,
    sun: "full",
    goals: ["salsa"],
    wants: [],
    notes: "",
    household: 2,
    experience: "new",
    time: "moderate",
    season: "spring",
    year: 2027,
    ...over,
  };
}

describe("catalog", () => {
  it("has unique ids, colors and labels for every plant", () => {
    const ids = PLANTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PLANTS) {
      expect(PLANT_COLORS[p.id], p.id).toBeTruthy();
      expect(PLANT_ABBR[p.id], p.id).toBeTruthy();
      for (const c of [...p.companions, ...p.avoid]) expect(ids, `${p.id} -> ${c}`).toContain(c);
      if (p.method === "transplant" && !p.perennial && p.id !== "strawberry") {
        expect(p.indoorWeeks, p.id).toBeGreaterThan(0);
      }
    }
  });
});

describe("dates", () => {
  it("does calendar math without time-zone drift", () => {
    expect(addDays("2027-02-27", 2)).toBe("2027-03-01");
    expect(diffDays("2027-01-01", "2027-12-31")).toBe(364);
    expect(fmtShort("2027-04-05")).toBe("Apr 5");
    expect(startOfWeek("2027-04-08")).toBe("2027-04-05"); // Thursday -> Monday
    expect(nextSaturday("2027-04-05")).toBe("2027-04-10");
  });
});

describe("climate", () => {
  it("parses zones and shifts frost dates by half-zone", () => {
    expect(parseZone("7b")).toEqual({ num: 7, half: "b" });
    const a = frostDatesForZone("7a");
    const b = frostDatesForZone("7b");
    expect(a.lastFrost > b.lastFrost).toBe(true);
    expect(a.firstFrost < b.firstFrost).toBe(true);
    expect(frostDatesForZone("11a").frostFree).toBe(true);
  });
  it("falls back to a regional estimate by ZIP prefix", () => {
    expect(lookupZip3("98101")?.state).toBe("WA");
    expect(lookupZip3("10001")?.state).toBe("NY");
    expect(lookupZip3("33101")?.zone).toBe("11a");
    expect(lookupZip3("00000")).toBeNull();
  });
});

describe("schedule", () => {
  const climate = buildClimate("20001", "7b", "DC", "estimate"); // LF ~Mar 30, FF ~Nov 6
  it("schedules tomatoes after the last frost with an indoor start", () => {
    const ctx = seasonContext(climate, "spring", 2027, "2026-12-01");
    const r = computeSchedule(getPlant("tomato"), ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.schedule.plantOut > ctx.lastFrost).toBe(true);
    expect(r.schedule.startIndoors! < ctx.lastFrost).toBe(true);
    expect(r.schedule.harvestEnd <= ctx.firstFrost).toBe(true);
  });
  it("plants cool crops before the last frost and offers a fall sowing", () => {
    const ctx = seasonContext(climate, "spring", 2027, "2026-12-01");
    const r = computeSchedule(getPlant("lettuce"), ctx);
    expect(r.ok && r.schedule.plantOut < ctx.lastFrost).toBe(true);
    expect(r.ok && r.schedule.successions.length).toBeGreaterThan(0);
    expect(r.ok && r.schedule.fallSow).toBeTruthy();
  });
  it("rejects garlic in spring and warm crops in a cold-zone fall plan", () => {
    const spring = seasonContext(climate, "spring", 2027, "2026-12-01");
    expect(computeSchedule(getPlant("garlic"), spring).ok).toBe(false);
    const fall = seasonContext(climate, "fall", 2026, "2026-07-15");
    expect(computeSchedule(getPlant("tomato"), fall).ok).toBe(false);
    const g = computeSchedule(getPlant("garlic"), fall);
    expect(g.ok && g.schedule.harvestStart.startsWith("2027")).toBe(true);
  });
  it("switches to nursery starts when the indoor start date has passed", () => {
    const ctx = seasonContext(climate, "spring", 2027, "2027-03-20");
    const r = computeSchedule(getPlant("tomato"), ctx);
    expect(r.ok && r.mustBuyStarts).toBe(true);
  });
  it("offers sensible season choices through the year", () => {
    expect(seasonOptions(climate, "2027-01-10")[0]).toMatchObject({ season: "spring", year: 2027 });
    const october = seasonOptions(climate, "2026-10-06");
    expect(october[0]).toMatchObject({ season: "spring", year: 2027 });
    const july = seasonOptions(climate, "2026-07-10");
    expect(july.map((o) => o.season)).toContain("fall");
  });
});

describe("layout", () => {
  it("places tall crops on the north edge and respects capacity", () => {
    const areas = [bed(4, 8)];
    expect(plantableSqFt(areas)).toBe(32);
    const { layouts, placed } = layoutGarden(areas, [
      { plantId: "lettuce", quantity: 8 },
      { plantId: "tomato", quantity: 2 },
      { plantId: "carrot", quantity: 32 },
    ]);
    expect(placed).toEqual({ lettuce: 8, tomato: 2, carrot: 32 });
    const l = layouts[0];
    expect(l.kind).toBe("bed");
    if (l.kind !== "bed") return;
    const tomatoes = l.cells.filter((c) => c.plantId === "tomato");
    expect(tomatoes.every((c) => c.y === 0 && c.w === 2 && c.h === 2)).toBe(true);
    const occupied = l.cells.reduce((n, c) => n + c.w * c.h, 0);
    expect(occupied).toBe(cellsNeeded(getPlant("tomato"), 2) + 2 + 2);
  });
  it("adds paths to wide in-ground plots and overflows to containers", () => {
    const areas: Area[] = [bed(10, 10, false), { kind: "containers", id: "c1", name: "Pots", count: 2, gallons: 5 }];
    expect(plantableSqFt(areas)).toBe(80);
    const { placed, layouts } = layoutGarden(areas, [{ plantId: "mint", quantity: 1 }]);
    expect(placed.mint).toBe(1);
    const pots = layouts.find((l) => l.kind === "containers");
    expect(pots?.kind === "containers" && pots.pots[0].plantId).toBe("mint");
  });
  it("never places more than fits", () => {
    const { placed } = layoutGarden([bed(2, 2)], [{ plantId: "winter-squash", quantity: 3 }]);
    expect(placed["winter-squash"]).toBeLessThanOrEqual(1);
  });
});

describe("recommendations", () => {
  it("reads plants and preferences from free-text notes", () => {
    const r = plantsFromNotes("We love spicy food and want peas and a few strawberries");
    expect(r.named).toEqual(expect.arrayContaining(["snap-peas", "strawberry"]));
    expect(r.implied).toContain("hot-pepper");
  });
  it("excludes full-sun crops in shade", () => {
    const input = makeInput({ sun: "shade" });
    const { evaluation } = planContext(input, "2026-12-01");
    expect(evaluation.feasible.some((c) => c.plant.id === "tomato")).toBe(false);
    expect(evaluation.feasible.some((c) => c.plant.id === "lettuce")).toBe(true);
  });
  it("builds a salsa garden that fits a 4×8 bed", () => {
    const input = makeInput();
    const { ctx, evaluation } = planContext(input, "2026-12-01");
    const design = designWithRules(input, evaluation, ctx);
    const ids = design.selections.map((s) => s.plantId);
    expect(ids).toEqual(expect.arrayContaining(["hot-pepper", "cilantro"]));
    expect(ids.some((id) => id.includes("tomato"))).toBe(true);
    const plan = buildPlan(input, design, "2026-12-01");
    expect(plan.stats.usedSqFt).toBeLessThanOrEqual(32);
    expect(plan.plants.length).toBeGreaterThan(3);
    expect(plan.tasks.length).toBeGreaterThan(10);
    expect(plan.shopping.some((i) => i.id === "soil:raised-mix")).toBe(true);
    expect(plan.tasks.every((t) => t.date >= "2026-12-01")).toBe(true);
    expect(new Set(plan.tasks.map((t) => t.id)).size).toBe(plan.tasks.length);
  });
  it("handles a container-only balcony", () => {
    const input = makeInput({
      spaceType: "containers",
      areas: [{ kind: "containers", id: "c1", name: "Balcony pots", count: 5, gallons: 5 }],
      goals: ["herbs", "salad"],
      sun: "partial",
    });
    const { ctx, evaluation } = planContext(input, "2026-12-01");
    const plan = buildPlan(input, designWithRules(input, evaluation, ctx), "2026-12-01");
    expect(plan.plants.length).toBeGreaterThan(0);
    const pots = plan.layouts[0];
    expect(pots.kind === "containers" && pots.pots.filter((p) => p.plantId).length).toBeLessThanOrEqual(5);
    expect(plan.plants.every((p) => getPlant(p.plantId).pot !== null)).toBe(true);
  });
  it("skips requested plants that can't grow and says why", () => {
    const input = makeInput({ wants: ["garlic", "tomato"], season: "spring" });
    const { ctx, evaluation } = planContext(input, "2026-12-01");
    const plan = buildPlan(input, designWithRules(input, evaluation, ctx), "2026-12-01");
    expect(plan.skipped.find((s) => s.name === "Garlic")?.reason).toMatch(/fall/i);
    expect(plan.plants.some((p) => p.plantId === "tomato")).toBe(true);
  });
  it("builds a fall plan in a warm zone", () => {
    const climate = buildClimate("78701", "9a", "TX", "estimate");
    const input = makeInput({ climate, zip: "78701", season: "fall", year: 2026, goals: ["salad", "cooking-greens"] });
    const { ctx, evaluation } = planContext(input, "2026-10-06");
    const plan = buildPlan(input, designWithRules(input, evaluation, ctx), "2026-10-06");
    expect(plan.plants.length).toBeGreaterThan(2);
    expect(plan.plants.every((p) => p.schedule.plantOut >= "2026-10-06")).toBe(true);
    const evalIds = evaluateCatalog(input, ctx).feasible.map((c) => c.plant.id);
    expect(evalIds).toContain("lettuce");
  });
});
