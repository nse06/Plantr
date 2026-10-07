// Core domain types shared by the planning engine, the AI layer and the UI.
// All calendar dates are ISO "YYYY-MM-DD" strings (no time zone).

export type Goal =
  | "salad"
  | "salsa"
  | "herbs"
  | "pollinators"
  | "kids"
  | "pizza"
  | "cooking-greens"
  | "preserving"
  | "low-maintenance";

export type Season = "cool" | "warm";
export type SunNeed = "full" | "partial";
export type SunExposure = "full" | "partial" | "shade";
export type Experience = "new" | "some" | "experienced";
export type TimeBudget = "minimal" | "moderate" | "plenty";
/** "indoor": a year-round windowsill or grow-light garden, scheduled from today instead of frost dates. */
export type PlanSeason = "spring" | "fall" | "indoor";
export type SpaceType = "in-ground" | "raised-bed" | "containers" | "mixed" | "indoor";

/** Which way an indoor garden's window faces. South gets the most light in the U.S. */
export type WindowFacing = "south" | "west" | "east" | "north" | "unsure";

/** Indoor light levels: 1 = a north window, 2 = an east or west window, 3 = a south window or a grow light. */
export type LightLevel = 1 | 2 | 3;

export interface IndoorSetup {
  window: WindowFacing;
  /** "have": already has a grow light; "buy": willing to get one; "none": window light only. */
  growLight: "have" | "buy" | "none";
  /** Cats or dogs that might chew on plants. */
  pets: boolean;
}

/** How a plant does indoors. Plants without one are outdoor-only. */
export interface IndoorRule {
  /** Light it needs to grow well. */
  light: LightLevel;
  /** Only worth growing under a grow light (fruiting crops). */
  growLightOnly?: boolean;
  /** Smallest workable pot (in gallons) and how many plants go in it. */
  pot: { gal: number; plants: number };
  /** Cap on plants per pot, however big the pot. */
  maxPerPot?: number;
  /** The easiest way to start it indoors. "scraps": regrow from grocery-store roots. */
  start: "seeds" | "starts" | "scraps";
  /** Days from planting (or sowing) to the first harvest. */
  dtm: number;
  /** Weeks of harvest before it's spent; omit for plants that keep producing. */
  harvestWeeks?: number;
  /** Re-sow every N weeks for a steady supply. */
  resow?: number;
  /** Compact varieties that suit pots on a sill. Falls back to the plant's varieties. */
  varieties?: string[];
  difficulty?: 1 | 2 | 3;
  tip: string;
}

export interface Plant {
  id: string;
  name: string;
  emoji: string;
  category: "vegetable" | "herb" | "flower" | "fruit";
  season: Season;
  frost: "tender" | "half-hardy" | "hardy";
  sun: SunNeed;
  /** Square-foot-gardening density: plants per square foot (0.25 = one plant per 2x2 ft). */
  perSqFt: number;
  heightIn: number;
  support?: "cage" | "stake" | "trellis";
  /** Minimum container (gallons) for one pot, and how many plants go in it. null = not for containers. */
  pot: { gal: number; plants: number } | null;
  /** Days to first harvest, counted from the date it goes in the garden (sow or transplant). */
  dtm: number;
  /** How long the harvest (or bloom) window typically lasts. */
  harvestWeeks: number;
  /** How a beginner should get it in the ground. */
  method: "transplant" | "direct";
  /** Weeks before the last-frost date to start seeds indoors (transplants only). */
  indoorWeeks?: number;
  /** Weeks relative to the last-frost date to sow/transplant outdoors (negative = before). */
  plantOutWeeks: number;
  /** Suitable for a second, late-summer planting that matures in fall. */
  fall?: boolean;
  /** Re-sow every N weeks for a continuous harvest. */
  succession?: number;
  /** Planted in fall and harvested the next summer (garlic). */
  overwinter?: boolean;
  perennial?: boolean;
  /** Beginners are better off buying nursery starts. */
  buyStarts?: boolean;
  difficulty: 1 | 2 | 3;
  water: "low" | "medium" | "high";
  feeder: "light" | "medium" | "heavy";
  companions: string[];
  avoid: string[];
  goals: Goal[];
  /** Suggested number of plants per household member. */
  perPerson: number;
  yield: string;
  varieties: string[];
  tips: string[];
  seedCost: number;
  startCost: number;
  /** Indoor growing, for windowsill and grow-light gardens. */
  indoor?: IndoorRule;
  /** Only grown indoors (microgreens): never offered for outdoor gardens. */
  indoorOnly?: boolean;
  /** Plain-English pet warning when cats or dogs may chew it (based on the ASPCA toxic plant list). */
  petCaution?: string;
}

export interface Climate {
  zip: string;
  zone: string; // e.g. "7a"
  state: string | null;
  city: string | null;
  lastFrost: string; // MM-DD, median last spring frost (32°F)
  firstFrost: string; // MM-DD, median first fall frost (32°F)
  frostFree: boolean;
  /** "noaa": nearest NOAA station normals; "usda-lookup"/"estimate": zone-based averages. */
  source: "noaa" | "usda-lookup" | "estimate" | "user";
  /** Nearest NOAA weather station the dates and temperatures come from. */
  station?: { name: string; distanceMi: number } | null;
  /** NOAA 1991–2020 monthly normal low and high temperatures (°F), January..December. */
  tmin?: number[] | null;
  tmax?: number[] | null;
}

export interface BedArea {
  kind: "bed";
  id: string;
  name: string;
  widthFt: number;
  lengthFt: number;
  raised: boolean;
}

export interface ContainerArea {
  kind: "containers";
  id: string;
  name: string;
  count: number;
  gallons: number;
  /** Pot diameter in inches, for indoor pots (which are sized in inches, not gallons). */
  potIn?: number;
}

export type Area = BedArea | ContainerArea;

/** Everything the user tells us in the wizard. */
export interface PlanInput {
  zip: string;
  climate: Climate;
  spaceType: SpaceType;
  areas: Area[];
  /** Beds/containers already exist and hold soil (false = we include building/filling them). */
  bedsReady: boolean;
  sun: SunExposure;
  goals: Goal[];
  wants: string[]; // plant ids explicitly requested
  notes: string; // free text ("we love spicy food")
  household: number;
  experience: Experience;
  time: TimeBudget;
  season: PlanSeason;
  year: number;
  photo?: PhotoAnalysis | null;
  /** Window and light details for indoor gardens. */
  indoor?: IndoorSetup | null;
}

export interface PhotoAnalysis {
  isGardenSpace: boolean;
  spaceType: SpaceType;
  widthFt: number;
  lengthFt: number;
  bedCount: number;
  containerCount: number;
  sun: SunExposure;
  sunReason: string;
  confidence: "low" | "medium" | "high";
  summary: string;
  observations: string[];
  concerns: string[];
  /** Indoor photos: usable length of the sill or shelf, in inches. */
  sillInches?: number | null;
}

/** What the AI (or the rule-based fallback) decides to plant. */
export interface PlantSelection {
  plantId: string;
  quantity: number;
  variety: string;
  reason: string;
}

export interface Design {
  selections: PlantSelection[];
  skipped: { name: string; reason: string }[];
  summary: string;
  tips: string[];
  source: "ai" | "rules";
}

export interface LayoutCell {
  x: number;
  y: number;
  w: number;
  h: number;
  plantId: string | null; // null = path
  count: number;
}

export interface BedLayout {
  areaId: string;
  kind: "bed";
  name: string;
  widthFt: number;
  lengthFt: number;
  cells: LayoutCell[];
}

export interface ContainerLayout {
  areaId: string;
  kind: "containers";
  name: string;
  pots: { plantId: string | null; count: number; gallons: number; potIn?: number }[];
}

export type AreaLayout = BedLayout | ContainerLayout;

export type EventKind =
  | "start-indoors"
  | "harden-off"
  | "transplant"
  | "sow"
  | "succession"
  | "thin"
  | "harvest";

export interface PlantSchedule {
  plantId: string;
  startIndoors?: string;
  plantOut: string;
  method: "transplant" | "direct";
  harvestStart: string;
  harvestEnd: string;
  successions: string[];
  fallSow?: string;
  warnings: string[];
}

export interface PlannedPlant {
  plantId: string;
  name: string;
  emoji: string;
  variety: string;
  quantity: number;
  placed: number;
  spacing: string;
  reason: string;
  schedule: PlantSchedule;
  acquire: "seeds" | "starts";
}

export type TaskCategory =
  | "prep"
  | "plant"
  | "care"
  | "harvest"
  | "protect";

export interface PlanTask {
  id: string;
  date: string;
  title: string;
  detail: string;
  category: TaskCategory;
  plantId: string | null;
}

export interface ShoppingItem {
  id: string;
  group: "Plants & seeds" | "Soil & amendments" | "Supplies";
  name: string;
  quantity: string;
  note: string;
  estCost: number;
}

export interface GardenPlan {
  version: 1;
  createdAt: string;
  season: PlanSeason;
  year: number;
  summary: string;
  tips: string[];
  skipped: { name: string; reason: string }[];
  plants: PlannedPlant[];
  layouts: AreaLayout[];
  tasks: PlanTask[];
  shopping: ShoppingItem[];
  stats: {
    growingSqFt: number;
    usedSqFt: number;
    plantCount: number;
    firstPlanting: string | null;
    firstHarvest: string | null;
    estCost: number;
  };
  designSource: "ai" | "rules";
}
