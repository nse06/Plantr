import type { Climate } from "./types";
import { diffDays, mmddToISO } from "./dates";

// ZIP code -> USDA hardiness zone -> average frost dates.
//
// Primary source: the public phzmapi.org dataset (USDA Plant Hardiness Zone Map by ZIP).
// Fallback: a ZIP-prefix table with representative zones, so the app keeps working offline.
// Frost dates are the typical averages for each zone; users can override them in the wizard.

/** Average last spring frost / first fall frost for the middle of each zone. */
const ZONE_FROST: Record<number, { last: string; first: string }> = {
  1: { last: "06-10", first: "08-20" },
  2: { last: "05-28", first: "09-03" },
  3: { last: "05-18", first: "09-15" },
  4: { last: "05-10", first: "09-25" },
  5: { last: "04-28", first: "10-08" },
  6: { last: "04-18", first: "10-20" },
  7: { last: "04-06", first: "10-30" },
  8: { last: "03-22", first: "11-12" },
  9: { last: "02-22", first: "12-03" },
  10: { last: "01-25", first: "12-20" },
};

const FROST_FREE_ZONE = 11;

export function isValidZip(zip: string): boolean {
  return /^\d{5}$/.test(zip);
}

function shiftMMDD(mmdd: string, days: number): string {
  const d = new Date(Date.UTC(2001, Number(mmdd.slice(0, 2)) - 1, Number(mmdd.slice(3, 5)) + days));
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function parseZone(zone: string): { num: number; half: "a" | "b" } | null {
  const m = /^(\d{1,2})([ab])?$/.exec(zone.trim().toLowerCase());
  if (!m) return null;
  return { num: Number(m[1]), half: (m[2] as "a" | "b") ?? "a" };
}

export function frostDatesForZone(zone: string): { lastFrost: string; firstFrost: string; frostFree: boolean } {
  const parsed = parseZone(zone);
  if (!parsed) return { lastFrost: ZONE_FROST[6].last, firstFrost: ZONE_FROST[6].first, frostFree: false };
  if (parsed.num >= FROST_FREE_ZONE) {
    // No reliable frost. Anchor the calendar on the cool, dry season the way local extension
    // services do: "spring" plantings start in late January, fall plantings run through December.
    return { lastFrost: "01-20", firstFrost: "12-31", frostFree: true };
  }
  const row = ZONE_FROST[Math.max(1, parsed.num)];
  // The "a" half of a zone is colder: later spring frost, earlier fall frost.
  const shift = parsed.half === "a" ? 7 : -7;
  return {
    lastFrost: shiftMMDD(row.last, shift),
    firstFrost: shiftMMDD(row.first, -shift),
    frostFree: false,
  };
}

/** Average number of frost-free days between last and first frost. */
export function seasonLengthDays(climate: Pick<Climate, "lastFrost" | "firstFrost">): number {
  return diffDays(mmddToISO(2001, climate.lastFrost), mmddToISO(2001, climate.firstFrost));
}

// ---------------------------------------------------------------------------
// ZIP prefix fallback
// ---------------------------------------------------------------------------

/** [first 3-digit prefix, last prefix, state, representative zone] */
const ZIP3: [number, number, string, string][] = [
  [5, 5, "NY", "7a"],
  [6, 7, "PR", "13a"],
  [8, 8, "VI", "12b"],
  [9, 9, "PR", "13a"],
  [10, 27, "MA", "6b"],
  [28, 29, "RI", "7a"],
  [30, 38, "NH", "5b"],
  [39, 49, "ME", "5b"],
  [50, 54, "VT", "5a"],
  [55, 55, "MA", "6b"],
  [56, 59, "VT", "5a"],
  [60, 69, "CT", "6b"],
  [70, 89, "NJ", "7a"],
  [100, 104, "NY", "7b"],
  [105, 119, "NY", "7a"],
  [120, 149, "NY", "5b"],
  [150, 196, "PA", "6b"],
  [197, 199, "DE", "7b"],
  [200, 200, "DC", "8a"],
  [201, 201, "VA", "7b"],
  [202, 205, "DC", "8a"],
  [206, 219, "MD", "7b"],
  [220, 246, "VA", "7a"],
  [247, 268, "WV", "6b"],
  [270, 289, "NC", "7b"],
  [290, 299, "SC", "8b"],
  [300, 319, "GA", "8a"],
  [320, 329, "FL", "9b"],
  [330, 332, "FL", "11a"],
  [333, 334, "FL", "10b"],
  [335, 339, "FL", "10a"],
  [341, 349, "FL", "10a"],
  [350, 369, "AL", "8a"],
  [370, 385, "TN", "7b"],
  [386, 397, "MS", "8b"],
  [398, 399, "GA", "8a"],
  [400, 427, "KY", "7a"],
  [430, 459, "OH", "6b"],
  [460, 479, "IN", "6b"],
  [480, 499, "MI", "6a"],
  [500, 528, "IA", "5b"],
  [530, 549, "WI", "5a"],
  [550, 567, "MN", "4b"],
  [570, 577, "SD", "5a"],
  [580, 588, "ND", "4a"],
  [590, 599, "MT", "5a"],
  [600, 629, "IL", "6a"],
  [630, 658, "MO", "6b"],
  [660, 679, "KS", "6b"],
  [680, 693, "NE", "5b"],
  [700, 714, "LA", "9a"],
  [716, 729, "AR", "8a"],
  [730, 732, "OK", "7b"],
  [733, 733, "TX", "9a"],
  [734, 749, "OK", "7b"],
  [750, 769, "TX", "8b"],
  [770, 778, "TX", "9b"],
  [779, 789, "TX", "9a"],
  [790, 797, "TX", "7b"],
  [798, 799, "TX", "8b"],
  [800, 816, "CO", "6a"],
  [820, 831, "WY", "5b"],
  [832, 838, "ID", "7a"],
  [840, 847, "UT", "7a"],
  [850, 853, "AZ", "10a"],
  [855, 865, "AZ", "9a"],
  [870, 884, "NM", "7a"],
  [885, 885, "TX", "8b"],
  [889, 891, "NV", "9b"],
  [893, 898, "NV", "7a"],
  [900, 921, "CA", "10b"],
  [922, 939, "CA", "9b"],
  [940, 951, "CA", "10a"],
  [952, 961, "CA", "9b"],
  [967, 968, "HI", "12a"],
  [969, 969, "GU", "13a"],
  [970, 974, "OR", "8b"],
  [975, 979, "OR", "7a"],
  [980, 986, "WA", "8b"],
  [988, 994, "WA", "6b"],
  [995, 999, "AK", "5a"],
];

export function lookupZip3(zip: string): { state: string; zone: string } | null {
  if (!isValidZip(zip)) return null;
  const prefix = Number(zip.slice(0, 3));
  const row = ZIP3.find(([lo, hi]) => prefix >= lo && prefix <= hi);
  return row ? { state: row[2], zone: row[3] } : null;
}

export function buildClimate(zip: string, zone: string, state: string | null, source: Climate["source"]): Climate {
  const frost = frostDatesForZone(zone);
  return {
    zip,
    zone,
    state,
    city: null,
    lastFrost: frost.lastFrost,
    firstFrost: frost.firstFrost,
    frostFree: frost.frostFree,
    source,
  };
}

const cache = new Map<string, Climate>();

/**
 * Resolve the growing climate for a U.S. ZIP code. Returns null for ZIPs that aren't
 * in the U.S. (or aren't valid). Never throws: if the lookup service is slow or down
 * we fall back to the regional estimate.
 */
export async function getClimate(zip: string): Promise<Climate | null> {
  if (!isValidZip(zip)) return null;
  const hit = cache.get(zip);
  if (hit) return hit;

  const regional = lookupZip3(zip);
  let zone: string | null = null;
  try {
    const res = await fetch(`https://phzmapi.org/${zip}.json`, {
      signal: AbortSignal.timeout(3500),
      cache: "force-cache",
    });
    if (res.ok) {
      const data = (await res.json()) as { zone?: string };
      if (data.zone && parseZone(data.zone)) zone = data.zone;
    }
  } catch {
    // Network problem: fall through to the estimate.
  }

  let climate: Climate | null = null;
  if (zone) climate = buildClimate(zip, zone, regional?.state ?? null, "usda-lookup");
  else if (regional) climate = buildClimate(zip, regional.zone, regional.state, "estimate");

  if (climate) {
    if (cache.size > 5000) cache.clear();
    cache.set(zip, climate);
  }
  return climate;
}

export const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "Washington, D.C.", FL: "Florida", GA: "Georgia", HI: "Hawaii",
  ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", PR: "Puerto Rico", VI: "U.S. Virgin Islands",
  GU: "Guam",
};
