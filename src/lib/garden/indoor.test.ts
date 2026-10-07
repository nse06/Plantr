import { describe, expect, it } from "vitest";
import type { Area, IndoorSetup, PlanInput } from "./types";
import { buildClimate } from "./climate";
import { addDays, addWeeks } from "./dates";
import { PLANTS } from "./plants";
import { designWithRules, evaluateCatalog } from "./recommend";
import { buildPlan, planContext } from "./plan";
import { seasonContext } from "./schedule";
import { INDOOR_WEEKS, indoorLight, plantsPerIndoorPot } from "./indoor";

const TODAY = "2026-10-07";

const pots = (count: number, potIn: number, gallons: number): Area => ({
  kind: "containers",
  id: "sill",
  name: "Windowsill",
  count,
  gallons,
  potIn,
});

function indoorInput(setup: Partial<IndoorSetup> = {}, over: Partial<PlanInput> = {}): PlanInput {
  return {
    zip: "10025",
    climate: buildClimate("10025", "7b", "NY", "estimate"),
    spaceType: "indoor",
    areas: [pots(6, 6, 0.6)],
    bedsReady: false,
    sun: "full",
    goals: ["herbs"],
    wants: [],
    notes: "",
    household: 2,
    experience: "new",
    time: "moderate",
    season: "indoor",
    year: 2026,
    indoor: { window: "south", growLight: "none", pets: false, ...setup },
    ...over,
  };
}

const feasibleIds = (input: PlanInput) =>
  evaluateCatalog(input, seasonContext(input.climate, "indoor", input.year, TODAY)).feasible.map((c) => c.plant.id);

describe("indoor light", () => {
  it("maps windows and grow lights to light levels", () => {
    expect(indoorLight({ window: "south", growLight: "none", pets: false })).toBe(3);
    expect(indoorLight({ window: "east", growLight: "none", pets: false })).toBe(2);
    expect(indoorLight({ window: "north", growLight: "none", pets: false })).toBe(1);
    expect(indoorLight({ window: "north", growLight: "buy", pets: false })).toBe(3);
  });

  it("offers only low-light plants for a north window", () => {
    const ids = feasibleIds(indoorInput({ window: "north" }));
    expect(ids).toEqual(expect.arrayContaining(["microgreens", "scallions", "mint", "parsley"]));
    expect(ids).not.toContain("basil");
    expect(ids).not.toContain("thyme");
  });

  it("needs a grow light (and a big enough pot) for fruiting crops", () => {
    expect(feasibleIds(indoorInput({ growLight: "none" }, { areas: [pots(4, 10, 2.5)] }))).not.toContain("cherry-tomato");
    expect(feasibleIds(indoorInput({ growLight: "buy" }, { areas: [pots(4, 10, 2.5)] }))).toContain("cherry-tomato");
    expect(feasibleIds(indoorInput({ growLight: "buy" }, { areas: [pots(4, 6, 0.6)] }))).not.toContain("cherry-tomato");
  });

  it("never offers outdoor-only crops indoors, or microgreens outdoors", () => {
    const ids = feasibleIds(indoorInput({ growLight: "have" }, { areas: [pots(6, 12, 4)] }));
    for (const id of ["zucchini", "sweet-corn", "pumpkin", "potato", "marigold"]) expect(ids).not.toContain(id);
    const outdoor = evaluateCatalog(
      { ...indoorInput(), spaceType: "raised-bed", season: "spring", year: 2027, indoor: null, areas: [{ kind: "bed", id: "b", name: "Bed", widthFt: 4, lengthFt: 8, raised: true }] },
      seasonContext(buildClimate("10025", "7b", "NY", "estimate"), "spring", 2027, TODAY),
    );
    expect(outdoor.feasible.map((c) => c.plant.id)).not.toContain("microgreens");
  });
});

describe("indoor pets and pots", () => {
  it("leaves out pet-toxic plants unless they were asked for", () => {
    const withPets = feasibleIds(indoorInput({ pets: true }));
    expect(withPets).not.toContain("chives");
    expect(withPets).not.toContain("mint");
    expect(withPets).toContain("basil");
    const asked = indoorInput({ pets: true }, { wants: ["chives"] });
    const ev = evaluateCatalog(asked, seasonContext(asked.climate, "indoor", 2026, TODAY));
    const chives = ev.feasible.find((c) => c.plant.id === "chives");
    expect(chives?.warnings.join(" ")).toMatch(/pets/i);
  });

  it("sizes plants to the pot", () => {
    const basil = PLANTS.find((p) => p.id === "basil")!;
    expect(plantsPerIndoorPot(basil, 0.25)).toBe(0);
    expect(plantsPerIndoorPot(basil, 0.6)).toBe(1);
    expect(plantsPerIndoorPot(basil, 4)).toBe(3);
    expect(feasibleIds(indoorInput({}, { areas: [pots(3, 4, 0.25)] }))).not.toContain("basil");
  });
});

describe("indoor plans", () => {
  const input = indoorInput({ window: "east", growLight: "buy" }, { goals: ["salad", "herbs"], areas: [pots(6, 8, 1.5)] });
  const { ctx, evaluation } = planContext(input, TODAY);
  const plan = buildPlan(input, designWithRules(input, evaluation, ctx), TODAY);

  it("runs on the indoor calendar from today, with re-sowing for quick crops", () => {
    expect(plan.season).toBe("indoor");
    for (const p of plan.plants) {
      expect(p.schedule.plantOut).toBe(addDays(TODAY, 3));
      expect(p.schedule.startIndoors).toBeUndefined();
      expect(p.schedule.harvestEnd <= addWeeks(addDays(TODAY, 3), INDOOR_WEEKS)).toBe(true);
    }
    const greens = plan.plants.find((p) => ["lettuce", "arugula", "microgreens", "spinach"].includes(p.plantId));
    expect(greens?.schedule.successions.length).toBeGreaterThan(0);
  });

  it("fills every pot on the sill", () => {
    const sill = plan.layouts.find((l) => l.kind === "containers");
    expect(sill?.kind).toBe("containers");
    if (sill?.kind === "containers") {
      expect(sill.pots).toHaveLength(6);
      expect(sill.pots.every((p) => p.plantId && p.potIn === 8)).toBe(true);
    }
  });

  it("has indoor tasks and no frost, hardening-off or mulching", () => {
    const titles = plan.tasks.map((t) => t.title).join(" | ");
    expect(titles).toMatch(/Get pots, saucers and potting mix/);
    expect(titles).toMatch(/Set up your grow light/);
    expect(titles).toMatch(/Weekly windowsill check-in|Weekly check-in & harvest/);
    expect(titles).not.toMatch(/frost|Harden off|Mulch/i);
  });

  it("shops for pots, indoor mix and the grow light, not garden supplies", () => {
    const ids = plan.shopping.map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(["pots:sill", "soil:potting-mix", "supply:grow-light", "supply:timer"]));
    expect(ids).not.toContain("supply:mulch");
    expect(ids).not.toContain("supply:row-cover");
    expect(plan.shopping.find((i) => i.id === "pots:sill")?.name).toMatch(/8-inch pots with saucers/);
  });
});

describe("indoor plans from an AI design", () => {
  const input = indoorInput({ pets: true }, { areas: [pots(5, 6, 0.6)], goals: ["herbs"] });
  // An AI answer that ignored the pets and picked an outdoor crop.
  const plan = buildPlan(
    input,
    {
      selections: [
        { plantId: "basil", quantity: 2, variety: "Genovese", reason: "Italian cooking." },
        { plantId: "oregano", quantity: 1, variety: "Greek", reason: "Pizza." },
        { plantId: "zucchini", quantity: 1, variety: "Black Beauty", reason: "Not for indoors." },
      ],
      skipped: [{ name: "Rosemary", reason: "Fussy indoors." }],
      summary: "Basil and oregano for an Italian windowsill.",
      tips: ["Let oregano dry out between waterings.", "Pinch basil weekly."],
      source: "ai",
    },
    TODAY,
  );

  it("drops what can't work and fills the spare pots with the next-best picks", () => {
    const ids = plan.plants.map((p) => p.plantId);
    expect(ids).toContain("basil");
    expect(ids).not.toContain("oregano");
    expect(ids).not.toContain("zucchini");
    expect(ids).not.toContain("rosemary");
    const sill = plan.layouts[0];
    expect(sill.kind === "containers" && sill.pots.every((p) => p.plantId)).toBe(true);
    expect(plan.skipped.map((s) => s.name)).toEqual(expect.arrayContaining(["Oregano", "Zucchini", "Rosemary"]));
  });

  it("never lets the summary or tips mention a plant that was dropped", () => {
    expect(plan.summary).not.toMatch(/oregano/i);
    expect(plan.tips.join(" ")).not.toMatch(/oregano/i);
    expect(plan.tips).toContain("Pinch basil weekly.");
  });
});
