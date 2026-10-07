import type { IndoorSetup, LightLevel, Plant, PlanInput, PlantSchedule, PlantSelection, WindowFacing } from "./types";
import { PLANTS_BY_ID } from "./plants";
import { addDays, addWeeks, minISO } from "./dates";
import type { SeasonContext } from "./schedule";

// Indoor (windowsill and grow-light) gardens. Light, not frost, is the limit: plants are
// matched to the window and any grow light, and the calendar runs from today at room
// temperature instead of from frost dates.

/** Standard indoor pot sizes. Gallons keep the shared container math working. */
export const INDOOR_POTS = [
  { inches: 4, gallons: 0.25, price: 2 },
  { inches: 6, gallons: 0.6, price: 4 },
  { inches: 8, gallons: 1.5, price: 7 },
  { inches: 10, gallons: 2.5, price: 10 },
  { inches: 12, gallons: 4, price: 14 },
] as const;

export function potForInches(inches: number) {
  return INDOOR_POTS.reduce((best, p) => (Math.abs(p.inches - inches) < Math.abs(best.inches - inches) ? p : best));
}

export function potInchesForGallons(gallons: number): number {
  return (INDOOR_POTS.find((p) => p.gallons >= gallons) ?? INDOOR_POTS[INDOOR_POTS.length - 1]).inches;
}

/** Weeks an indoor plan covers. Herbs keep going after that; the plan nudges a refresh. */
export const INDOOR_WEEKS = 24;

/** Days needed to buy pots, mix and plants before the first planting. */
const LEAD_DAYS = 3;

export function isIndoor(input: Pick<PlanInput, "spaceType">): boolean {
  return input.spaceType === "indoor";
}

export const WINDOW_LABELS: Record<WindowFacing, string> = {
  south: "South-facing",
  west: "West-facing",
  east: "East-facing",
  north: "North-facing",
  unsure: "Not sure",
};

const WINDOW_LIGHT: Record<WindowFacing, LightLevel> = { south: 3, west: 2, east: 2, north: 1, unsure: 2 };

/** The light an indoor setup provides. A grow light makes any spot bright. */
export function indoorLight(setup: IndoorSetup | null | undefined): LightLevel {
  if (!setup) return 2;
  return setup.growLight === "none" ? WINDOW_LIGHT[setup.window] : 3;
}

/** Sun exposure equivalent of an indoor setup, for code and copy that think in outdoor terms. */
export function indoorSun(setup: IndoorSetup | null | undefined): "full" | "partial" | "shade" {
  return ({ 3: "full", 2: "partial", 1: "shade" } as const)[indoorLight(setup)];
}

export function lightLabel(setup: IndoorSetup | null | undefined): string {
  if (!setup) return "a bright window";
  const win =
    setup.window === "unsure"
      ? "a window (direction unknown)"
      : `${setup.window === "east" ? "an" : "a"} ${WINDOW_LABELS[setup.window].toLowerCase()} window`;
  if (setup.growLight === "have") return `${win} plus a grow light`;
  if (setup.growLight === "buy") return `${win} plus a new grow light`;
  return win;
}

/** How many plants of this kind fit in one indoor pot (0 = pot too small, or not an indoor plant). */
export function plantsPerIndoorPot(plant: Plant, gallons: number): number {
  const rule = plant.indoor;
  if (!rule || gallons < rule.pot.gal) return 0;
  const n = rule.pot.plants * Math.max(1, Math.floor(gallons / rule.pot.gal));
  return Math.min(n, rule.maxPerPot ?? rule.pot.plants * 3);
}

/** Spacing in indoor terms: "2 per 6-inch pot". */
export function indoorSpacingLabel(plant: Plant, gallons: number): string {
  const inches = potInchesForGallons(gallons);
  if (plant.id === "microgreens") return `one ${inches}-inch pot per sowing`;
  return `${Math.max(1, plantsPerIndoorPot(plant, gallons))} per ${inches}-inch pot`;
}

export function indoorDifficulty(plant: Plant): 1 | 2 | 3 {
  return plant.indoor?.difficulty ?? plant.difficulty;
}

export function indoorVarieties(plant: Plant): string[] {
  return plant.indoor?.varieties ?? plant.varieties;
}

/** True when the plan's dates include the dark months (November to February). */
function spansWinter(start: string): boolean {
  const end = addWeeks(start, INDOOR_WEEKS);
  for (let d = start; d <= end; d = addDays(d, 14)) {
    const m = Number(d.slice(5, 7));
    if (m >= 11 || m <= 2) return true;
  }
  return false;
}

export type IndoorCheck = { ok: true; warnings: string[] } | { ok: false; reason: string };

/** Can this plant grow in this indoor setup, and what should the gardener watch for? */
export function indoorCheck(plant: Plant, input: PlanInput, maxGallons: number, today: string, wanted = false): IndoorCheck {
  const rule = plant.indoor;
  const setup = input.indoor;
  if (!rule) {
    return { ok: false, reason: `${plant.name} needs an outdoor garden: it's too big or too sun-hungry for indoors.` };
  }
  if (rule.growLightOnly && setup?.growLight === "none") {
    return { ok: false, reason: `${plant.name} only flowers and fruits indoors under a grow light.` };
  }
  const light = indoorLight(setup);
  if (rule.light > light) {
    return {
      ok: false,
      reason: `${plant.name} needs more light than ${lightLabel(setup)} gives. A small grow light would make it work.`,
    };
  }
  if (maxGallons > 0 && maxGallons < rule.pot.gal) {
    return { ok: false, reason: `${plant.name} needs at least a ${potInchesForGallons(rule.pot.gal)}-inch pot.` };
  }
  // Pet owners don't get plants that are toxic to cats and dogs unless they ask for them.
  if (setup?.pets && plant.petCaution && !wanted) {
    return { ok: false, reason: `${plant.petCaution} We left it out because you have pets.` };
  }
  const warnings: string[] = [];
  if (setup?.growLight === "none" && rule.light === 3 && spansWinter(today)) {
    warnings.push("Winter light is weak, so expect slow growth from November to February. A small grow light keeps it going.");
  }
  if (setup?.window === "unsure" && setup.growLight === "none" && rule.light >= 2) {
    warnings.push("Give it your brightest window. An east, west or south window works.");
  }
  if (setup?.pets && plant.petCaution) warnings.push(`${plant.petCaution} Keep it where pets can't reach.`);
  return { ok: true, warnings };
}

/** Indoor calendar: plant a few days from now, harvest after the indoor days-to-harvest, re-sow quick crops. */
export function indoorSchedule(plant: Plant, ctx: SeasonContext): PlantSchedule | null {
  const rule = plant.indoor;
  if (!rule) return null;
  const start = addDays(ctx.today, LEAD_DAYS);
  const horizon = addWeeks(start, INDOOR_WEEKS);
  const harvestStart = addDays(start, rule.dtm);

  const successions: string[] = [];
  if (rule.resow) {
    for (let d = addWeeks(start, rule.resow); addDays(d, rule.dtm) <= horizon && successions.length < 10; d = addWeeks(d, rule.resow)) {
      successions.push(d);
    }
  }
  const lastSow = successions.at(-1) ?? start;
  const harvestEnd = rule.harvestWeeks
    ? minISO(horizon, addWeeks(addDays(lastSow, rule.dtm), rule.harvestWeeks))
    : horizon;
  return {
    plantId: plant.id,
    plantOut: start,
    method: rule.start === "seeds" ? "direct" : "transplant",
    harvestStart,
    harvestEnd: harvestEnd > addDays(harvestStart, 7) ? harvestEnd : addDays(harvestStart, 7),
    successions,
    warnings: [],
  };
}

/** A starting quantity: one pot each (two of the kitchen staples for bigger households). */
export function indoorDefaultQuantity(plant: Plant, input: PlanInput, maxGallons: number): number {
  if (plant.indoor?.start === "scraps") return Math.max(1, plantsPerIndoorPot(plant, maxGallons));
  const per = Math.max(1, plantsPerIndoorPot(plant, maxGallons));
  const staples = ["basil", "lettuce", "microgreens"];
  const pots = input.household >= 3 && staples.includes(plant.id) ? 2 : 1;
  return per * pots;
}

export function indoorSummary(input: PlanInput, selections: PlantSelection[]): string {
  const names = selections.slice(0, 4).map((s) => PLANTS_BY_ID[s.plantId]?.name.toLowerCase());
  const more = selections.length > 4 ? ` and ${selections.length - 4} more` : "";
  return (
    `A ${selections.length}-crop indoor garden for ${lightLabel(input.indoor)}: ${names.join(", ")}${more}. ` +
    "Every pick suits your light and pot size, and the calendar runs year-round from today, with re-sowing for the quick crops."
  );
}

export function indoorTips(input: PlanInput, today: string): string[] {
  const tips = [
    "Water when the top inch of mix feels dry, then empty the saucer after half an hour. Soggy roots kill more houseplants than anything.",
    "Turn each pot a quarter turn every few days so plants grow straight instead of leaning toward the glass.",
  ];
  const setup = input.indoor;
  if (setup?.growLight !== "none") {
    tips.push("Run the grow light 14–16 hours a day on a cheap outlet timer, 6–12 inches above the leaves.");
  } else {
    tips.push("Keep pots right against the glass (within a foot of the window). Light drops off fast as you move into the room.");
    if (spansWinter(today)) {
      tips.push("Growth slows in the short days of November to February. That's normal; a small LED grow light keeps things going.");
    }
  }
  if (setup?.pets) tips.push("Some herbs upset pets' stomachs. Keep those up high, and check the ASPCA's toxic plant list if you're unsure.");
  tips.push("Winter air is dry. Group pots together, or set them on a tray of pebbles and water, to raise the humidity.");
  return tips.slice(0, 4);
}
