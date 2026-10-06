import type { AreaLayout, PlanInput, PlannedPlant, ShoppingItem } from "./types";
import { getPlant } from "./plants";
import { bedGridSize } from "./layout";

// Everything needed to execute the plan, with rough U.S. retail prices so people can budget.

const RAISED_BED_DEPTH_FT = 1;
const BAG_RAISED_MIX_CUFT = 1.5;
const BAG_COMPOST_CUFT = 1;
const BAG_POTTING_CUFT = 1.5;
const GALLONS_PER_CUFT = 7.48;

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildShopping(
  plants: PlannedPlant[],
  input: PlanInput,
  layouts: AreaLayout[],
): ShoppingItem[] {
  const items: ShoppingItem[] = [];

  // ---- Plants & seeds ----
  for (const p of plants) {
    const plant = getPlant(p.plantId);
    const variety = p.variety ? `'${p.variety}'` : "";
    if (p.plantId === "garlic") {
      const heads = Math.max(1, Math.ceil(p.quantity / 7));
      items.push({
        id: `plant:${p.plantId}`,
        group: "Plants & seeds",
        name: `Seed garlic ${variety}`.trim(),
        quantity: `${heads} head${heads > 1 ? "s" : ""} (~${p.quantity} cloves)`,
        note: "From a garden center or seed company, not the grocery store.",
        estCost: money(heads * plant.startCost),
      });
    } else if (p.plantId === "potato") {
      const lb = Math.max(1, Math.ceil(p.quantity / 5));
      items.push({
        id: `plant:${p.plantId}`,
        group: "Plants & seeds",
        name: `Certified seed potatoes ${variety}`.trim(),
        quantity: `${lb} lb`,
        note: "Each pound gives about 5 seed pieces.",
        estCost: money(lb * plant.startCost),
      });
    } else if (p.acquire === "starts") {
      items.push({
        id: `plant:${p.plantId}`,
        group: "Plants & seeds",
        name: `${p.name} plants ${variety}`.trim(),
        quantity: `${p.quantity}`,
        note:
          p.plantId === "strawberry"
            ? "Bare-root bundles are cheapest. Plant them right away."
            : "Nursery starts (transplants) give you a head start.",
        estCost: money(p.quantity * plant.startCost),
      });
    } else {
      const packets = p.quantity > 60 || p.schedule.successions.length >= 3 ? 2 : 1;
      items.push({
        id: `plant:${p.plantId}`,
        group: "Plants & seeds",
        name: `${p.name} seeds ${variety}`.trim(),
        quantity: `${packets} packet${packets > 1 ? "s" : ""}`,
        note: p.schedule.startIndoors ? "Start indoors. See your calendar." : "Sow directly in the garden.",
        estCost: money(packets * plant.seedCost),
      });
    }
  }

  // ---- Soil ----
  const beds = input.areas.filter((a) => a.kind === "bed");
  const containers = input.areas.filter((a) => a.kind === "containers");
  const bedSqFt = beds.reduce((n, b) => {
    const { cols, rows } = bedGridSize(b);
    return n + cols * rows;
  }, 0);

  const raisedBeds = beds.filter((b) => b.raised);
  const groundBeds = beds.filter((b) => !b.raised);
  if (raisedBeds.length && !input.bedsReady) {
    const cuft = raisedBeds.reduce((n, b) => n + b.widthFt * b.lengthFt * RAISED_BED_DEPTH_FT, 0);
    const bags = Math.ceil(cuft / BAG_RAISED_MIX_CUFT);
    const yards = cuft / 27;
    items.push({
      id: "soil:raised-mix",
      group: "Soil & amendments",
      name: "Raised-bed soil mix",
      quantity: bags > 25 ? `${yards.toFixed(1)} cu yd (bulk)` : `${bags} bags (1.5 cu ft)`,
      note: `Fills ${Math.round(cuft)} cu ft at 12 inches deep.${bags > 25 ? " Bulk delivery is much cheaper at this size." : ""}`,
      estCost: money(bags > 25 ? Math.max(1, yards) * 60 + 50 : bags * 10),
    });
    // One line per bed size ("Raised bed frame, 4×8 ft × 3").
    const sizes = new Map<string, { w: number; l: number; count: number }>();
    for (const b of raisedBeds) {
      const [w, l] = [Math.min(b.widthFt, b.lengthFt), Math.max(b.widthFt, b.lengthFt)];
      const key = `${w}x${l}`;
      const prev = sizes.get(key);
      sizes.set(key, { w, l, count: (prev?.count ?? 0) + 1 });
    }
    for (const [key, { w, l, count }] of sizes) {
      items.push({
        id: `build:${key}`,
        group: "Supplies",
        name: `Raised bed frame, ${w}×${l} ft`,
        quantity: `${count}`,
        note: "A kit, or untreated cedar boards with corner brackets.",
        estCost: money(2 * (w + l) * 5 * count),
      });
    }
  }
  const compostSqFt =
    groundBeds.reduce((n, b) => n + b.widthFt * b.lengthFt, 0) +
    (input.bedsReady ? raisedBeds.reduce((n, b) => n + b.widthFt * b.lengthFt, 0) : 0);
  if (compostSqFt > 0) {
    const inches = groundBeds.length && !input.bedsReady ? 3 : 2;
    const cuft = (compostSqFt * inches) / 12;
    const bags = Math.ceil(cuft / BAG_COMPOST_CUFT);
    items.push({
      id: "soil:compost",
      group: "Soil & amendments",
      name: "Compost",
      quantity: `${bags} bag${bags > 1 ? "s" : ""} (1 cu ft)`,
      note: `${inches} inches over ${Math.round(compostSqFt)} sq ft, mixed into the top few inches.`,
      estCost: money(bags * 8),
    });
  }
  if (containers.length) {
    const gallons = containers.reduce((n, c) => n + c.count * c.gallons, 0);
    const bags = Math.ceil(gallons / GALLONS_PER_CUFT / BAG_POTTING_CUFT);
    items.push({
      id: "soil:potting-mix",
      group: "Soil & amendments",
      name: "Potting mix",
      quantity: `${bags} bag${bags > 1 ? "s" : ""} (1.5 cu ft)`,
      note: "Use potting mix, not garden soil. It stays light and drains well.",
      estCost: money(bags * 13),
    });
    if (!input.bedsReady) {
      for (const c of containers) {
        items.push({
          id: `pots:${c.id}`,
          group: "Supplies",
          name: `${c.gallons}-gallon containers or fabric grow bags`,
          quantity: `${c.count}`,
          note: "Any pot works if it has drainage holes. Fabric bags are cheap and light.",
          estCost: money(c.count * Math.max(4, c.gallons * 0.9)),
        });
      }
    }
  }

  // ---- Supplies ----
  let cages = 0;
  let stakes = 0;
  let trellisFt = 0;
  for (const layout of layouts) {
    if (layout.kind === "bed") {
      for (const cell of layout.cells) {
        if (!cell.plantId) continue;
        const support = getPlant(cell.plantId).support;
        if (support === "cage") cages += cell.count;
        else if (support === "stake") stakes += cell.count;
        else if (support === "trellis") trellisFt += cell.w;
      }
    } else {
      for (const pot of layout.pots) {
        if (!pot.plantId) continue;
        const support = getPlant(pot.plantId).support;
        if (support === "cage") cages += 1;
        else if (support === "stake") stakes += 1;
        else if (support === "trellis") trellisFt += 2;
      }
    }
  }
  if (cages) {
    items.push({
      id: "supply:cages",
      group: "Supplies",
      name: "Tomato cages (heavy-duty, 54 in+)",
      quantity: `${cages}`,
      note: "Flimsy cone cages collapse under full-size plants.",
      estCost: money(cages * 9),
    });
  }
  if (stakes) {
    items.push({
      id: "supply:stakes",
      group: "Supplies",
      name: "Garden stakes & soft plant ties",
      quantity: `${stakes}`,
      note: "4 ft bamboo or wooden stakes.",
      estCost: money(stakes * 1.5 + 4),
    });
  }
  if (trellisFt) {
    const ft = Math.max(4, Math.ceil(trellisFt / 2) * 2);
    items.push({
      id: "supply:trellis",
      group: "Supplies",
      name: "Trellis netting + 2 posts",
      quantity: `${ft} ft`,
      note: "A cattle panel or nylon netting on T-posts, 5–7 ft tall.",
      estCost: money(15 + ft * 2.5),
    });
  }
  if (bedSqFt > 0) {
    const bales = Math.max(1, Math.ceil(bedSqFt / 80));
    items.push({
      id: "supply:mulch",
      group: "Supplies",
      name: "Straw mulch (seed-free) or shredded leaves",
      quantity: `${bales} bale${bales > 1 ? "s" : ""}`,
      note: "Holds in moisture and smothers weeds.",
      estCost: money(bales * 12),
    });
  }
  const feeders = plants.some((p) => getPlant(p.plantId).feeder !== "light");
  if (feeders) {
    items.push({
      id: "supply:fertilizer",
      group: "Soil & amendments",
      name: "Balanced organic fertilizer (e.g. 5-5-5)",
      quantity: "1 bag (4 lb)",
      note: "For feeding hungry crops every few weeks.",
      estCost: 15,
    });
  }
  if (plants.some((p) => p.acquire === "seeds" && p.schedule.startIndoors)) {
    items.push({
      id: "supply:seed-starting",
      group: "Supplies",
      name: "Seed-starting kit (cell trays, dome, seed-starting mix)",
      quantity: "1",
      note: "Keep a shop light or LED grow light 2–3 inches above seedlings so they don't get leggy.",
      estCost: 22,
    });
  }
  const needsCover =
    input.season === "fall" ||
    plants.some((p) => ["broccoli", "cabbage", "kale", "bok-choy", "eggplant", "arugula"].includes(p.plantId));
  if (needsCover) {
    items.push({
      id: "supply:row-cover",
      group: "Supplies",
      name: "Floating row cover (10 × 20 ft)",
      quantity: "1",
      note: input.season === "fall" ? "Adds weeks of harvest once frosts arrive." : "Keeps pests like flea beetles and cabbage moths off.",
      estCost: 16,
    });
  }
  if (input.time === "minimal" || bedSqFt >= 48) {
    items.push({
      id: "supply:drip",
      group: "Supplies",
      name: "Soaker hose or drip kit + hose timer",
      quantity: "1",
      note: "Waters for you. The single biggest time-saver in a vegetable garden.",
      estCost: 40,
    });
  }

  return items;
}
