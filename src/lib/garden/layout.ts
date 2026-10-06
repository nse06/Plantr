import type { Area, AreaLayout, BedArea, BedLayout, ContainerLayout, LayoutCell, Plant } from "./types";
import { getPlant } from "./plants";

// Square-foot-garden layout. The top edge of every bed is north: tall and trellised crops
// go there so they don't shade shorter ones. Beds are drawn with their long side horizontal.

export interface LayoutRequest {
  plantId: string;
  quantity: number;
}

export interface LayoutResult {
  layouts: AreaLayout[];
  placed: Record<string, number>;
}

type Occupant = string | null; // plant id, null = free
const PATH = "__path__";

interface Grid {
  area: BedArea;
  cols: number;
  rows: number;
  occ: Occupant[][];
  cells: LayoutCell[];
}

const MAX_SIDE = 40;

function toCells(ft: number): number {
  return Math.min(MAX_SIDE, Math.max(1, Math.floor(ft + 0.25)));
}

export function bedGridSize(area: BedArea): { cols: number; rows: number } {
  const a = toCells(area.widthFt);
  const b = toCells(area.lengthFt);
  return { cols: Math.max(a, b), rows: Math.min(a, b) };
}

/** In-ground plots deeper than 4 ft get a 1-ft path every fifth row so every square is reachable. */
export function isPathRow(area: BedArea, rows: number, r: number): boolean {
  return !area.raised && rows > 4 && r % 5 === 4;
}

function makeGrid(area: BedArea): Grid {
  const { cols, rows } = bedGridSize(area);
  const occ: Occupant[][] = [];
  const cells: LayoutCell[] = [];
  for (let r = 0; r < rows; r++) {
    const path = isPathRow(area, rows, r);
    occ.push(Array.from({ length: cols }, () => (path ? PATH : null)));
    if (path) cells.push({ x: 0, y: r, w: cols, h: 1, plantId: null, count: 0 });
  }
  return { area, cols, rows, occ, cells };
}

/** Number of plantable square feet across all beds. */
export function plantableSqFt(areas: Area[]): number {
  let total = 0;
  for (const area of areas) {
    if (area.kind !== "bed") continue;
    const { cols, rows } = bedGridSize(area);
    for (let r = 0; r < rows; r++) if (!isPathRow(area, rows, r)) total += cols;
  }
  return total;
}

export function potCount(areas: Area[]): number {
  return areas.reduce((n, a) => (a.kind === "containers" ? n + a.count : n), 0);
}

export function maxPotGallons(areas: Area[]): number {
  return areas.reduce((g, a) => (a.kind === "containers" ? Math.max(g, a.gallons) : g), 0);
}

/** Square feet a quantity of a plant needs in a bed. */
export function cellsNeeded(plant: Plant, quantity: number): number {
  if (plant.perSqFt >= 1) return Math.ceil(quantity / plant.perSqFt);
  return quantity * Math.round(1 / plant.perSqFt);
}

/** How many plants of this kind fit in one pot of the given size (0 = pot too small). */
export function plantsPerPot(plant: Plant, gallons: number): number {
  if (!plant.pot || gallons < plant.pot.gal) return 0;
  return plant.pot.plants * Math.max(1, Math.floor(gallons / plant.pot.gal));
}

function fits(grid: Grid, c: number, r: number, w: number, h: number): boolean {
  if (c + w > grid.cols || r + h > grid.rows) return false;
  for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) if (grid.occ[y][x] !== null) return false;
  return true;
}

function mark(grid: Grid, c: number, r: number, w: number, h: number, id: string) {
  for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) grid.occ[y][x] = id;
}

function blockShapes(area: number, rows: number): [number, number][] {
  const side = Math.round(Math.sqrt(area));
  const shapes: [number, number][] = [];
  if (side * side === area) shapes.push([side, side]);
  else shapes.push([area, 1], [1, area]); // e.g. 1×2
  if (side > rows) shapes.push([Math.ceil(area / rows), rows]);
  return shapes;
}

function placeBlocks(grids: Grid[], plant: Plant, quantity: number): number {
  const area = Math.round(1 / plant.perSqFt);
  let placed = 0;
  for (let i = 0; i < quantity; i++) {
    let done = false;
    for (const grid of grids) {
      for (const [w, h] of blockShapes(area, grid.rows)) {
        for (let r = 0; r < grid.rows && !done; r++) {
          for (let c = 0; c < grid.cols && !done; c++) {
            if (fits(grid, c, r, w, h)) {
              mark(grid, c, r, w, h, plant.id);
              grid.cells.push({ x: c, y: r, w, h, plantId: plant.id, count: 1 });
              done = true;
            }
          }
        }
        if (done) break;
      }
      if (done) break;
    }
    if (!done) break;
    placed++;
  }
  return placed;
}

function placeSquares(grids: Grid[], plant: Plant, quantity: number): number {
  let remaining = quantity;
  for (const grid of grids) {
    for (let r = 0; r < grid.rows && remaining > 0; r++) {
      for (let c = 0; c < grid.cols && remaining > 0; c++) {
        if (grid.occ[r][c] !== null) continue;
        const n = Math.min(plant.perSqFt, remaining);
        grid.occ[r][c] = plant.id;
        grid.cells.push({ x: c, y: r, w: 1, h: 1, plantId: plant.id, count: n });
        remaining -= n;
      }
    }
    if (remaining <= 0) break;
  }
  return quantity - remaining;
}

/** Tall first (north side), then big blocks before small squares to limit fragmentation. */
function bedOrder(a: Plant, b: Plant): number {
  const cls = (p: Plant) => (p.heightIn >= 48 || p.support === "trellis" ? 0 : p.heightIn >= 18 ? 1 : 2);
  const blockArea = (p: Plant) => (p.perSqFt < 1 ? Math.round(1 / p.perSqFt) : 0);
  return cls(a) - cls(b) || blockArea(b) - blockArea(a) || b.heightIn - a.heightIn;
}

/** Herbs that spread or prefer sharp drainage are better in pots when pots are available. */
const POT_PREFERRED = new Set(["mint", "rosemary", "thyme", "oregano", "sage", "chives", "strawberry"]);

interface Pot {
  areaIndex: number;
  gallons: number;
  plantId: string | null;
  count: number;
}

function placeInPots(pots: Pot[], plant: Plant, quantity: number): number {
  let remaining = quantity;
  // Use the smallest pot that fits first so big pots stay free for big plants.
  const order = pots
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.plantId === null && plantsPerPot(plant, p.gallons) > 0)
    .sort((a, b) => a.p.gallons - b.p.gallons || a.i - b.i);
  for (const { p } of order) {
    if (remaining <= 0) break;
    const n = Math.min(plantsPerPot(plant, p.gallons), remaining);
    p.plantId = plant.id;
    p.count = n;
    remaining -= n;
  }
  return quantity - remaining;
}

export function layoutGarden(areas: Area[], requests: LayoutRequest[]): LayoutResult {
  const grids = areas.filter((a): a is BedArea => a.kind === "bed").map(makeGrid);
  const pots: Pot[] = [];
  areas.forEach((a, areaIndex) => {
    if (a.kind !== "containers") return;
    for (let i = 0; i < a.count; i++) pots.push({ areaIndex, gallons: a.gallons, plantId: null, count: 0 });
  });

  const placed: Record<string, number> = {};
  const remaining = new Map<string, number>();
  for (const req of requests) {
    if (req.quantity <= 0) continue;
    remaining.set(req.plantId, (remaining.get(req.plantId) ?? 0) + req.quantity);
    placed[req.plantId] = 0;
  }
  const take = (id: string, n: number) => {
    placed[id] += n;
    remaining.set(id, (remaining.get(id) ?? 0) - n);
  };

  // 1. Pot-preferred herbs go to containers when there are both beds and containers.
  if (pots.length && grids.length) {
    for (const [id, qty] of remaining) {
      if (POT_PREFERRED.has(id)) take(id, placeInPots(pots, getPlant(id), qty));
    }
  }

  // 2. Beds: tall crops on the north edge.
  if (grids.length) {
    const ids = [...remaining.keys()].filter((id) => (remaining.get(id) ?? 0) > 0);
    ids.sort((a, b) => bedOrder(getPlant(a), getPlant(b)));
    for (const id of ids) {
      const plant = getPlant(id);
      const qty = remaining.get(id) ?? 0;
      const n = plant.perSqFt >= 1 ? placeSquares(grids, plant, qty) : placeBlocks(grids, plant, qty);
      take(id, n);
    }
  }

  // 3. Containers take whatever is left, in priority order.
  if (pots.length) {
    for (const [id, qty] of remaining) {
      if (qty > 0) take(id, placeInPots(pots, getPlant(id), qty));
    }
  }

  const layouts: AreaLayout[] = [];
  let gi = 0;
  areas.forEach((area, areaIndex) => {
    if (area.kind === "bed") {
      const g = grids[gi++];
      const bed: BedLayout = {
        areaId: area.id,
        kind: "bed",
        name: area.name,
        widthFt: g.cols,
        lengthFt: g.rows,
        cells: g.cells.sort((a, b) => a.y - b.y || a.x - b.x),
      };
      layouts.push(bed);
    } else {
      const c: ContainerLayout = {
        areaId: area.id,
        kind: "containers",
        name: area.name,
        pots: pots
          .filter((p) => p.areaIndex === areaIndex)
          .map((p) => ({ plantId: p.plantId, count: p.count, gallons: p.gallons })),
      };
      layouts.push(c);
    }
  });

  return { layouts, placed };
}
