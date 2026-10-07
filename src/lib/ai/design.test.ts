import { afterEach, describe, expect, it } from "vitest";
import type { PlanInput } from "@/lib/garden/types";
import { buildClimate } from "@/lib/garden/climate";
import { planContext } from "@/lib/garden/plan";
import { planRequestSchema } from "@/lib/validation";
import { shouldUseAiDesign } from "@/lib/server/planner";
import { situation } from "./design";

const TODAY = "2026-10-07";

function input(over: Partial<PlanInput> = {}): PlanInput {
  return {
    zip: "20001",
    climate: buildClimate("20001", "7b", "DC", "estimate"),
    spaceType: "raised-bed",
    areas: [{ kind: "bed", id: "b1", name: "Bed 1", widthFt: 4, lengthFt: 8, raised: true }],
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

describe("design prompt", () => {
  it("lists a shortlist of candidates instead of the whole catalog", () => {
    const i = input({ wants: ["watermelon"], areas: [{ kind: "containers", id: "c", name: "Pots", count: 4, gallons: 5 }], spaceType: "containers" });
    const { ctx, evaluation } = planContext(i, TODAY);
    const text = situation(i, ctx, evaluation);
    const candidates = text.split("Candidates")[1].split("\n").filter((l) => l.startsWith("- ")).length;
    expect(candidates).toBeLessThanOrEqual(24 + 1);
    expect(text).toContain("Today: October 2026.");
    // Watermelon can't grow in pots: the reason is passed along so the model can explain it.
    expect(text).toMatch(/They asked for these[\s\S]*Watermelon: Watermelon sprawls too much for containers/);
  });

  it("describes indoor gardens by their light, pots and pets", () => {
    const i = input({
      spaceType: "indoor",
      season: "indoor",
      year: 2026,
      sun: "full",
      goals: ["herbs"],
      areas: [{ kind: "containers", id: "c", name: "Windowsill", count: 5, gallons: 0.6, potIn: 6 }],
      indoor: { window: "south", growLight: "none", pets: true },
    });
    const { ctx, evaluation } = planContext(i, TODAY);
    const text = situation(i, ctx, evaluation);
    expect(text).toContain("Indoor garden: 5 × 6-inch pots on a south-facing window.");
    expect(text).toContain("cats or dogs");
    expect(text).not.toMatch(/frost/i);
    expect(text).not.toMatch(/- chives:/);
  });
});

describe("when to call the AI designer", () => {
  const saved = process.env.PLANTR_AI_DESIGN;
  afterEach(() => {
    if (saved === undefined) delete process.env.PLANTR_AI_DESIGN;
    else process.env.PLANTR_AI_DESIGN = saved;
  });

  it("uses the free rule-based designer unless there are notes or a photo", () => {
    delete process.env.PLANTR_AI_DESIGN;
    expect(shouldUseAiDesign(input())).toBe(false);
    expect(shouldUseAiDesign(input({ notes: "We love spicy food" }))).toBe(true);
    expect(
      shouldUseAiDesign(
        input({
          photo: {
            isGardenSpace: true,
            spaceType: "raised-bed",
            widthFt: 4,
            lengthFt: 8,
            bedCount: 1,
            containerCount: 0,
            sun: "full",
            sunReason: "",
            confidence: "medium",
            summary: "",
            observations: [],
            concerns: [],
          },
        }),
      ),
    ).toBe(true);
  });

  it("can be forced on or off", () => {
    process.env.PLANTR_AI_DESIGN = "always";
    expect(shouldUseAiDesign(input())).toBe(true);
    process.env.PLANTR_AI_DESIGN = "never";
    expect(shouldUseAiDesign(input({ notes: "We love spicy food" }))).toBe(false);
  });
});

describe("indoor plan requests", () => {
  const base = {
    zip: "10025",
    spaceType: "indoor",
    areas: [{ kind: "containers", count: 4, gallons: 0.6, potIn: 6 }],
    bedsReady: false,
    sun: "full",
    goals: ["herbs"],
    wants: [],
    household: 2,
    experience: "new",
    time: "moderate",
    season: "indoor",
    year: 2026,
    indoor: { window: "east", growLight: "none", pets: false },
  };

  it("accepts a windowsill garden", () => {
    expect(planRequestSchema.safeParse(base).success).toBe(true);
  });

  it("rejects indoor requests without light details, with beds, or on an outdoor calendar", () => {
    expect(planRequestSchema.safeParse({ ...base, indoor: null }).success).toBe(false);
    expect(planRequestSchema.safeParse({ ...base, season: "spring" }).success).toBe(false);
    expect(
      planRequestSchema.safeParse({ ...base, areas: [{ kind: "bed", widthFt: 4, lengthFt: 8, raised: true }] }).success,
    ).toBe(false);
    expect(planRequestSchema.safeParse({ ...base, spaceType: "containers" }).success).toBe(false);
  });
});
