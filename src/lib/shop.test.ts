import { describe, expect, it } from "vitest";
import type { PlanInput, ShoppingItem } from "@/lib/garden/types";
import { buildClimate } from "@/lib/garden/climate";
import { buildPlan, planContext } from "@/lib/garden/plan";
import { designWithRules } from "@/lib/garden/recommend";
import { NO_AFFILIATES, clickItemKey, earnsCommission, merchantUrl, shopLinks, shopQuery } from "./shop";

const TODAY = "2026-10-08";
const TAGGED = { amazonTag: "plantr-20", homeDepotTemplate: "https://homedepot.sjv.io/c/1/2/3?u={url}" };

const item = (id: string, name: string, group: ShoppingItem["group"] = "Supplies"): ShoppingItem => ({
  id,
  group,
  name,
  quantity: "1",
  note: "",
  estCost: 0,
});

function plan(over: Partial<PlanInput>) {
  const input: PlanInput = {
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
  const { ctx, evaluation } = planContext(input, TODAY);
  return buildPlan(input, designWithRules(input, evaluation, ctx), TODAY);
}

describe("shopping searches", () => {
  it("searches for the crop when buying nursery plants, and the variety when buying seeds", () => {
    expect(shopQuery(item("plant:tomato", "Tomato plants 'Celebrity'", "Plants & seeds"))).toEqual({ q: "tomato plant", kind: "plants" });
    expect(shopQuery(item("plant:cantaloupe", "Cantaloupe seeds 'Hale's Best Jumbo'", "Plants & seeds"))).toEqual({
      q: "hale's best jumbo cantaloupe seeds",
      kind: "seeds",
    });
    expect(shopQuery(item("plant:garlic", "Seed garlic 'Music'", "Plants & seeds"))?.q).toBe("music seed garlic");
    expect(shopQuery(item("plant:basil", "Potted basil", "Plants & seeds"))).toEqual({ q: "potted basil", kind: "plants" });
  });

  it("skips things you get at the grocery store", () => {
    expect(shopQuery(item("plant:scallions", "Green onions from the grocery store", "Plants & seeds"))).toBeNull();
  });

  it("turns supplies into searches that find the right thing", () => {
    expect(shopQuery(item("pots:patio", "5-gallon containers or fabric grow bags"))?.q).toBe("5 gallon fabric grow bags");
    expect(shopQuery(item("pots:sill", "8-inch pots with saucers"))?.q).toBe("8 inch plant pots with saucers");
    expect(shopQuery(item("build:4x8", "Raised bed frame, 4×8 ft"))?.q).toBe("4x8 raised garden bed");
    expect(shopQuery(item("supply:fertilizer", "Liquid all-purpose fertilizer", "Soil & amendments"))).toEqual({
      q: "liquid all purpose plant food",
      kind: "soil",
    });
    expect(shopQuery(item("supply:fertilizer", "Balanced organic fertilizer (e.g. 5-5-5)", "Soil & amendments"))?.q).toBe(
      "organic all purpose fertilizer",
    );
    // Items added later fall back to a tidied-up name.
    expect(shopQuery(item("supply:hori-hori", "Hori-hori knife (stainless) & sheath"))).toEqual({ q: "hori-hori knife sheath", kind: "supplies" });
  });

  it("gives every item in real plans a clean search", () => {
    const plans = [
      plan({ wants: ["potato", "lettuce"], time: "minimal" }),
      plan({ season: "fall", year: 2026, spaceType: "in-ground", goals: ["cooking-greens"], wants: ["garlic"], areas: [{ kind: "bed", id: "b1", name: "Bed", widthFt: 4, lengthFt: 10, raised: false }] }),
      plan({ spaceType: "containers", areas: [{ kind: "containers", id: "patio", name: "Patio", count: 6, gallons: 5 }] }),
      plan({
        spaceType: "indoor",
        season: "indoor",
        goals: ["herbs"],
        wants: ["scallions", "microgreens"],
        areas: [{ kind: "containers", id: "sill", name: "Windowsill", count: 6, gallons: 0.6, potIn: 6 }],
        indoor: { window: "south", growLight: "buy", pets: false },
      }),
    ];
    for (const p of plans) {
      for (const i of p.shopping) {
        const query = shopQuery(i);
        if (i.name.includes("grocery store")) {
          expect(query, i.id).toBeNull();
          continue;
        }
        expect(query?.q, i.id).toMatch(/^[a-z0-9][a-z0-9 '.-]{2,79}$/);
        expect(shopLinks(i, NO_AFFILIATES), i.id).toHaveLength(2);
      }
    }
  });
});

describe("store links", () => {
  it("links straight to store searches when no affiliate program is set up", () => {
    expect(merchantUrl("amazon", "tomato cages", NO_AFFILIATES)).toEqual({ url: "https://www.amazon.com/s?k=tomato+cages", affiliate: false });
    expect(merchantUrl("homedepot", "tomato cages", NO_AFFILIATES)).toEqual({ url: "https://www.homedepot.com/s/tomato%20cages", affiliate: false });
    expect(earnsCommission(NO_AFFILIATES)).toBe(false);
  });

  it("adds the Amazon tag and wraps Home Depot links in the affiliate deep link", () => {
    expect(merchantUrl("amazon", "tomato cages", TAGGED).url).toBe("https://www.amazon.com/s?k=tomato+cages&tag=plantr-20");
    expect(merchantUrl("homedepot", "tomato cages", TAGGED)).toEqual({
      url: "https://homedepot.sjv.io/c/1/2/3?u=https%3A%2F%2Fwww.homedepot.com%2Fs%2Ftomato%2520cages",
      affiliate: true,
    });
    expect(earnsCommission({ ...NO_AFFILIATES, amazonTag: "plantr-20" })).toBe(true);
    expect(earnsCommission({ ...NO_AFFILIATES, amazonTag: "plantr-20" }, "homedepot")).toBe(false);
  });

  it("puts the best store first for each kind of item", () => {
    const stores = (i: ShoppingItem) => shopLinks(i, TAGGED).map((l) => l.name);
    expect(stores(item("plant:lettuce", "Lettuce seeds 'Buttercrunch'", "Plants & seeds"))).toEqual(["Amazon", "Home Depot"]);
    expect(stores(item("plant:tomato", "Tomato plants 'Celebrity'", "Plants & seeds"))).toEqual(["Home Depot", "Amazon"]);
    expect(stores(item("soil:raised-mix", "Raised-bed soil mix", "Soil & amendments"))).toEqual(["Home Depot", "Amazon"]);
    expect(stores(item("supply:grow-light", "Full-spectrum LED grow light"))).toEqual(["Amazon", "Home Depot"]);
  });

  it("records clicks under stable item keys", () => {
    expect(clickItemKey("plant:cherry-tomato")).toBe("plant:cherry-tomato");
    expect(clickItemKey("build:4x8")).toBe("build:4x8");
    expect(clickItemKey("pots:a1b2c3")).toBe("pots");
    expect(clickItemKey("plant:<script>")).toBeNull();
    expect(clickItemKey("https://example.com")).toBeNull();
  });
});
