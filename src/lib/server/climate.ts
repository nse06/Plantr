import type { Climate } from "@/lib/garden/types";
import { buildClimate, climateFromStation, isValidZip, lookupZip3, parseZone } from "@/lib/garden/climate";
import stationsFile from "@/lib/garden/data/stations.json";
import zipFile from "@/lib/garden/data/zip-stations.json";

// ZIP -> climate, server side only (the station tables are ~1.4 MB and never reach the browser).
//
// 1. Frost dates + monthly temperatures: NOAA 1991–2020 climate normals from the weather
//    station nearest the ZIP code's center (precomputed by scripts/build_climate_data.py).
// 2. USDA hardiness zone: the public phzmapi.org lookup, falling back to a regional estimate.

type StationRow = [name: string, lat: number, lon: number, lastFrost: string, firstFrost: string, tmin: number[], tmax: number[]];

const STATIONS = (stationsFile as unknown as { stations: StationRow[] }).stations;
let zipIndex: Map<string, [number, number]> | null = null;

function stationFor(zip: string): { row: StationRow; distanceMi: number } | null {
  if (!zipIndex) {
    zipIndex = new Map();
    for (const line of (zipFile as { data: string }).data.split("\n")) {
      const [z, i, d] = line.split(",");
      if (z) zipIndex.set(z, [Number(i), Number(d)]);
    }
  }
  const hit = zipIndex.get(zip);
  if (!hit) return null;
  const row = STATIONS[hit[0]];
  return row ? { row, distanceMi: hit[1] } : null;
}

const mmdd = (s: string) => (s ? `${s.slice(0, 2)}-${s.slice(2)}` : "");

async function lookupZone(zip: string): Promise<string | null> {
  try {
    const res = await fetch(`https://phzmapi.org/${zip}.json`, {
      signal: AbortSignal.timeout(3500),
      cache: "force-cache",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { zone?: string };
    return data.zone && parseZone(data.zone) ? data.zone : null;
  } catch {
    return null;
  }
}

const cache = new Map<string, Climate>();

/**
 * Resolve the growing climate for a U.S. ZIP code. Returns null for ZIPs we can't place in
 * the U.S. Never throws: if the zone lookup is slow or down we fall back to estimates.
 */
export async function getClimate(zip: string): Promise<Climate | null> {
  if (!isValidZip(zip)) return null;
  const hit = cache.get(zip);
  if (hit) return hit;

  const regional = lookupZip3(zip);
  const station = stationFor(zip);
  if (!regional && !station) return null;

  const zone = (await lookupZone(zip)) ?? regional?.zone ?? null;
  let climate: Climate | null = null;
  if (station && zone) {
    const [name, , , lf, ff, tmin, tmax] = station.row;
    climate = climateFromStation(zip, zone, regional?.state ?? null, {
      name,
      distanceMi: station.distanceMi,
      lastFrost: mmdd(lf),
      firstFrost: mmdd(ff),
      tmin,
      tmax,
    });
  } else if (zone) {
    climate = buildClimate(zip, zone, regional?.state ?? null, regional && zone === regional.zone ? "estimate" : "usda-lookup");
  }

  if (climate) {
    if (cache.size > 5000) cache.clear();
    cache.set(zip, climate);
  }
  return climate;
}
