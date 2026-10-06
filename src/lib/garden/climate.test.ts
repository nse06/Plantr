import { beforeAll, describe, expect, it, vi } from "vitest";
import { getClimate } from "@/lib/server/climate";
import { computeSchedule, seasonContext } from "./schedule";
import { getPlant } from "./plants";
import { normalOn } from "./temps";

// Real NOAA normals for a few very different U.S. climates. The zone lookup is stubbed
// offline so the tests are hermetic (the regional fallback supplies the zone).
beforeAll(() => {
  vi.stubGlobal("fetch", async () => {
    throw new Error("offline");
  });
});

async function climate(zip: string) {
  const c = await getClimate(zip);
  if (!c) throw new Error(`no climate for ${zip}`);
  return c;
}

describe("NOAA climate lookup", () => {
  it("uses the nearest station's frost dates and temperatures", async () => {
    const c = await climate("60601"); // Chicago
    expect(c.source).toBe("noaa");
    expect(c.station?.name).toMatch(/Chicago/i);
    expect(c.lastFrost).toMatch(/^04-/);
    expect(c.tmin).toHaveLength(12);
  });

  it("treats Miami and San Francisco as frost-free", async () => {
    expect((await climate("33101")).frostFree).toBe(true);
    expect((await climate("94103")).frostFree).toBe(true);
  });

  it("interpolates monthly normals smoothly", () => {
    const tmin = [10, 20, 30, 40, 50, 60, 70, 60, 50, 40, 30, 20];
    expect(normalOn(tmin, "2027-01-15")).toBeCloseTo(10, 0);
    expect(normalOn(tmin, "2027-05-30")).toBeGreaterThan(50);
    expect(normalOn(tmin, "2027-05-30")).toBeLessThan(60);
  });
});

describe("temperature-aware scheduling", () => {
  it("waits for warm nights before planting tomatoes in Seattle", async () => {
    const c = await climate("98101");
    const ctx = seasonContext(c, "spring", 2027, "2026-12-01");
    const r = computeSchedule(getPlant("tomato"), ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // The last frost is in March, but nights don't reliably stay above 50°F until late May.
    expect(r.schedule.plantOut >= "2027-05-15").toBe(true);
    expect(r.schedule.startIndoors! >= "2027-03-15").toBe(true);
  });

  it("plants Chicago tomatoes around mid-May", async () => {
    const ctx = seasonContext(await climate("60601"), "spring", 2027, "2026-12-01");
    const r = computeSchedule(getPlant("tomato"), ctx);
    expect(r.ok && r.schedule.plantOut >= "2027-05-10" && r.schedule.plantOut <= "2027-06-01").toBe(true);
  });

  it("ends Phoenix tomato harvests when summer nights get too hot", async () => {
    const ctx = seasonContext(await climate("85004"), "spring", 2027, "2026-12-01");
    const r = computeSchedule(getPlant("tomato"), ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.schedule.plantOut < "2027-04-01").toBe(true);
    expect(r.schedule.harvestEnd < "2027-07-15").toBe(true);
  });

  it("keeps Phoenix spring lettuce ahead of the heat", async () => {
    const ctx = seasonContext(await climate("85004"), "spring", 2027, "2026-10-06");
    const r = computeSchedule(getPlant("lettuce"), ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.schedule.harvestEnd < "2027-05-15").toBe(true);
  });

  it("delays fall lettuce in Austin until the heat breaks", async () => {
    const ctx = seasonContext(await climate("78701"), "fall", 2026, "2026-07-15");
    const r = computeSchedule(getPlant("lettuce"), ctx);
    expect(r.ok && r.schedule.plantOut >= "2026-09-01").toBe(true);
  });
});
