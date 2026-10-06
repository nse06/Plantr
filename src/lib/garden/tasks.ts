import type { PlanInput, PlannedPlant, PlanTask, TaskCategory } from "./types";
import { getPlant } from "./plants";
import { addDays, addWeeks, fmtShort, maxISO, minISO, nextSaturday } from "./dates";
import type { SeasonContext } from "./schedule";

// Turns the plant schedules into a dated, checkable to-do list. Task ids are deterministic
// (kind + plant + date) so completion state survives regenerating the plan.

const CATEGORY_ORDER: Record<TaskCategory, number> = { prep: 0, plant: 1, protect: 2, care: 3, harvest: 4 };

/** "Green onions" -> "green onion" for phrases like "green onion seedlings". */
function singular(name: string): string {
  const n = name.toLowerCase();
  return n.endsWith("s") && !n.endsWith("ss") ? n.slice(0, -1) : n;
}

function plantsLabel(n: number, name: string): string {
  return `${n} ${singular(name)} plant${n === 1 ? "" : "s"}`;
}

function seedsLabel(name: string): string {
  const n = name.toLowerCase();
  return n.endsWith("s") ? n : `${n} seeds`;
}

function list(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function buyStartsTask(p: PlannedPlant): { title: string; detail: string } {
  if (p.plantId === "garlic") {
    const heads = Math.max(1, Math.ceil(p.quantity / 7));
    return {
      title: `Buy seed garlic (${heads} head${heads > 1 ? "s" : ""})`,
      detail: "Get it from a garden center or seed company. Grocery garlic often isn't adapted to your climate.",
    };
  }
  if (p.plantId === "potato") {
    const lb = Math.max(1, Math.ceil(p.quantity / 5));
    return {
      title: `Buy ${lb} lb of seed potatoes`,
      detail: "Cut large ones into chunks with 2 'eyes' each and let the cuts dry for a day before planting.",
    };
  }
  return {
    title: `Buy ${plantsLabel(p.quantity, p.name)}`,
    detail: `Look for ${p.variety ? `'${p.variety}' or similar: ` : ""}stocky, dark-green plants without flowers or yellow leaves.`,
  };
}

const THIN_AFTER: Record<string, number> = { radish: 10, arugula: 12, spinach: 14, lettuce: 14, "bok-choy": 14 };

export function buildTasks(plants: PlannedPlant[], input: PlanInput, ctx: SeasonContext): PlanTask[] {
  const tasks: PlanTask[] = [];
  const { today } = ctx;
  const add = (t: Omit<PlanTask, "date"> & { date: string }) => {
    tasks.push({ ...t, date: maxISO(t.date, today) });
  };
  if (plants.length === 0) return tasks;

  const firstOutdoor = minISO(...plants.map((p) => p.schedule.plantOut));
  const firstAction = minISO(
    ...plants.map((p) =>
      p.acquire === "seeds" && p.schedule.startIndoors
        ? p.schedule.startIndoors
        : p.acquire === "starts"
          ? addDays(p.schedule.plantOut, -5)
          : p.schedule.plantOut,
    ),
  );
  // Overwintering crops (garlic) sit dormant for months; keep them out of the weekly rhythm.
  const seasonal = plants.filter((p) => !getPlant(p.plantId).overwinter);
  const lastHarvest = seasonal.length ? maxISO(...seasonal.map((p) => p.schedule.harvestEnd)) : null;

  // ---- Prep ----
  add({
    id: `prep:order:${ctx.year}`,
    date: addDays(firstAction, -14),
    title: "Order seeds and supplies",
    detail: "Your shopping list has everything. Popular varieties sell out early, so order now and store seeds somewhere cool and dry.",
    category: "prep",
    plantId: null,
  });
  const hasBeds = input.areas.some((a) => a.kind === "bed");
  const anyRaised = input.areas.some((a) => a.kind === "bed" && a.raised);
  add({
    id: `prep:beds:${ctx.year}`,
    date: addDays(firstOutdoor, -10),
    title: hasBeds ? (anyRaised ? "Get your beds ready" : "Prepare the planting area") : "Set up your containers",
    detail: hasBeds
      ? anyRaised
        ? "Fill new beds with raised-bed mix, or top up existing ones with 2–3 inches of compost. Rake smooth and water well."
        : "Remove grass and weeds, loosen the soil 8–12 inches deep, and mix in 2–3 inches of compost."
      : "Make sure every pot has drainage holes, fill with fresh potting mix (not garden soil), and water it in.",
    category: "prep",
    plantId: null,
  });

  // ---- Per-plant planting events ----
  const hardenByDate = new Map<string, string[]>();
  for (const p of plants) {
    const plant = getPlant(p.plantId);
    const s = p.schedule;
    if (s.startIndoors && p.acquire === "seeds") {
      add({
        id: `indoors:${p.plantId}:${s.startIndoors}`,
        date: s.startIndoors,
        title: `Start ${singular(p.name)} seeds indoors`,
        detail: `Sow ${Math.ceil(p.quantity * 1.5)} seeds ¼ inch deep in seed-starting mix under lights. ${
          plant.season === "warm" ? "Keep them warm (75–80°F) until they sprout." : "Cool-season seedlings like 60–70°F."
        }`,
        category: "plant",
        plantId: p.plantId,
      });
    }
    if (p.acquire === "starts") {
      const t = buyStartsTask(p);
      add({
        id: `buy:${p.plantId}:${s.plantOut}`,
        date: addDays(s.plantOut, -5),
        ...t,
        category: "prep",
        plantId: p.plantId,
      });
    }
    if (s.method === "transplant" && p.acquire === "seeds" && s.startIndoors) {
      const d = addDays(s.plantOut, -7);
      hardenByDate.set(d, [...(hardenByDate.get(d) ?? []), p.name.toLowerCase()]);
    }

    const supportNote =
      plant.support === "cage"
        ? " Put the cage on at planting time; it's hard to cage a big plant later."
        : plant.support === "stake"
          ? " Add a stake now so you don't disturb roots later."
          : "";
    const frostNote =
      plant.frost === "tender" && ctx.season === "spring"
        ? " Check the 10-day forecast first. If frost is predicted, wait or cover them overnight."
        : "";
    if (plant.support === "trellis") {
      add({
        id: `trellis:${p.plantId}:${s.plantOut}`,
        date: addDays(s.plantOut, -2),
        title: `Put up a trellis for ${p.name.toLowerCase()}`,
        detail: "Install it on the north edge of the bed before planting: 5–7 ft of netting or a cattle panel on sturdy posts.",
        category: "prep",
        plantId: p.plantId,
      });
    }
    if (p.plantId === "garlic") {
      add({
        id: `plant:${p.plantId}:${s.plantOut}`,
        date: s.plantOut,
        title: `Plant ${p.quantity} garlic cloves`,
        detail: "Break heads into cloves. Plant pointy end up, 2 inches deep and 4–6 inches apart, then mulch with 4 inches of straw.",
        category: "plant",
        plantId: p.plantId,
      });
    } else if (s.method === "transplant") {
      add({
        id: `plant:${p.plantId}:${s.plantOut}`,
        date: s.plantOut,
        title: `Plant ${plantsLabel(p.quantity, p.name)}`,
        detail: `Space them ${p.spacing}. Water well after planting.${supportNote}${frostNote}`,
        category: "plant",
        plantId: p.plantId,
      });
    } else {
      add({
        id: `sow:${p.plantId}:${s.plantOut}`,
        date: s.plantOut,
        title: p.plantId === "potato" ? `Plant ${p.quantity} seed potatoes` : `Sow ${seedsLabel(p.name)}`,
        detail:
          p.plantId === "potato"
            ? "Plant pieces 4 inches deep, cut side down, 12 inches apart. Hill soil around stems as they grow."
            : `Sow for ${p.quantity} plants (${p.spacing}). Keep the soil evenly moist until seedlings appear.${supportNote}`,
        category: "plant",
        plantId: p.plantId,
      });
      if (plant.perSqFt >= 4 || p.plantId === "swiss-chard" || p.plantId === "beet") {
        const d = addDays(s.plantOut, THIN_AFTER[p.plantId] ?? 18);
        add({
          id: `thin:${p.plantId}:${d}`,
          date: d,
          title: `Thin ${singular(p.name)} seedlings`,
          detail: `Thin to ${plant.perSqFt >= 1 ? `${plant.perSqFt} per square foot` : p.spacing}. Snip extras at soil level so you don't disturb the roots${
            p.plantId === "beet" || p.plantId === "lettuce" ? ", and eat the thinnings" : ""
          }.`,
          category: "care",
          plantId: p.plantId,
        });
      }
    }
    for (const d of s.successions) {
      add({
        id: `succession:${p.plantId}:${d}`,
        date: d,
        title: `Sow another round of ${p.name.toLowerCase()}`,
        detail: "Another small sowing keeps the harvest coming. Fill any gap where an earlier crop finished.",
        category: "plant",
        plantId: p.plantId,
      });
    }
    if (s.fallSow) {
      add({
        id: `fallsow:${p.plantId}:${s.fallSow}`,
        date: s.fallSow,
        title: `Plant ${p.name.toLowerCase()} for a fall harvest`,
        detail: "Cool-season crops sown now mature as the weather cools, often sweeter than in spring.",
        category: "plant",
        plantId: p.plantId,
      });
    }
    if (plant.overwinter) {
      const wake = addWeeks(ctx.nextLastFrost, -2);
      add({
        id: `garlic-spring:${p.plantId}:${wake}`,
        date: wake,
        title: `Check on your ${p.name.toLowerCase()}`,
        detail: "Once green shoots appear, pull the mulch back a little and feed with compost or a nitrogen-rich fertilizer.",
        category: "care",
        plantId: p.plantId,
      });
      const scapes = addWeeks(s.harvestStart, -3);
      add({
        id: `scapes:${p.plantId}:${scapes}`,
        date: scapes,
        title: "Snap off garlic scapes",
        detail: "Hardneck garlic sends up curly flower stalks. Snap them off (and cook them!) so the plant puts its energy into the bulb.",
        category: "care",
        plantId: p.plantId,
      });
    }
    add({
      id: `harvest:${p.plantId}:${s.harvestStart}`,
      date: s.harvestStart,
      title: plant.category === "flower" ? `${p.name} starts blooming` : `${p.name} harvest begins`,
      detail:
        plant.category === "flower"
          ? `Blooms from about ${fmtShort(s.harvestStart)} to ${fmtShort(s.harvestEnd)}. ${plant.tips[2] ?? plant.yield}`
          : `Expect to pick from about ${fmtShort(s.harvestStart)} to ${fmtShort(s.harvestEnd)}. ${plant.yield}.`,
      category: "harvest",
      plantId: p.plantId,
    });
  }

  for (const [date, names] of hardenByDate) {
    add({
      id: `harden:${date}`,
      date,
      title: `Harden off seedlings: ${list(names)}`,
      detail: "Set them outside in a sheltered spot for an hour or two, adding a little more sun and wind each day for a week.",
      category: "protect",
      plantId: null,
    });
  }

  // ---- Feeding heavy feeders every 4 weeks ----
  const feedByDate = new Map<string, string[]>();
  for (const p of plants) {
    const plant = getPlant(p.plantId);
    if (plant.feeder !== "heavy" || p.plantId === "garlic") continue;
    for (let d = addWeeks(p.schedule.plantOut, 4); d <= addWeeks(p.schedule.harvestEnd, -2); d = addWeeks(d, 4)) {
      const sat = nextSaturday(d);
      feedByDate.set(sat, [...(feedByDate.get(sat) ?? []), p.name.toLowerCase()]);
    }
  }
  for (const [date, names] of feedByDate) {
    add({
      id: `feed:${date}`,
      date,
      title: `Feed ${list([...new Set(names)])}`,
      detail: "Scatter a handful of compost or balanced organic fertilizer (like 5-5-5) around each plant, then water it in.",
      category: "care",
      plantId: null,
    });
  }

  // ---- Mulch once the soil has warmed / plants are established ----
  const mulchDate =
    ctx.season === "spring"
      ? maxISO(addWeeks(ctx.lastFrost, 4), addDays(firstOutdoor, 21))
      : addDays(firstOutdoor, 21);
  if (hasBeds) {
    add({
      id: `mulch:${ctx.year}:${ctx.season}`,
      date: mulchDate,
      title: "Mulch your beds",
      detail: "Spread 2–3 inches of straw or shredded leaves around plants (not touching stems) to hold moisture and smother weeds.",
      category: "care",
      plantId: null,
    });
  }

  // ---- Weekly check-ins ----
  if (lastHarvest) {
    const seasonalStart = minISO(...seasonal.map((p) => p.schedule.plantOut));
    const weeklyStart = nextSaturday(addDays(seasonalStart, 3));
    const weeklyEnd = minISO(lastHarvest, addWeeks(weeklyStart, 40));
    for (let d = weeklyStart; d <= weeklyEnd; d = addWeeks(d, 1)) {
      // Nothing much to do while the garden sleeps through a frosty winter.
      if (!ctx.climate.frostFree && d > addDays(ctx.firstFrost, 21) && d < addWeeks(ctx.nextLastFrost, -2)) continue;
      add({ id: `weekly:${d}`, ...weeklyCheck(d, seasonal, seasonalStart, input), category: "care", plantId: null, date: d });
    }
  }

  // ---- Frost & season wrap-up ----
  const hasTender = seasonal.some((p) => getPlant(p.plantId).frost === "tender" && p.schedule.harvestEnd >= addDays(ctx.firstFrost, -21));
  const hasHardy = seasonal.some((p) => getPlant(p.plantId).frost !== "tender" && p.schedule.harvestEnd > ctx.firstFrost);
  if (!ctx.climate.frostFree && (hasTender || hasHardy)) {
    add({
      id: `frost:${ctx.firstFrost}`,
      date: addDays(ctx.firstFrost, -10),
      title: `First frost is due around ${fmtShort(ctx.firstFrost)}`,
      detail: [
        hasTender ? "Pick tomatoes, peppers, squash and other tender crops before a frost (green tomatoes ripen indoors)." : "",
        hasHardy ? "Cover greens with row cover on cold nights to keep harvesting for weeks." : "",
      ]
        .filter(Boolean)
        .join(" "),
      category: "protect",
      plantId: null,
    });
  }
  if (lastHarvest) {
    const wrap = addDays(lastHarvest, 3);
    add({
      id: `wrapup:${ctx.year}:${ctx.season}`,
      date: wrap,
      title: "Put the garden to bed",
      detail:
        "Pull spent plants (compost the healthy ones), spread compost or shredded leaves over bare soil, and jot down what worked. Then plan your next season in Plantr.",
      category: "prep",
      plantId: null,
    });
  }

  return tasks.sort(
    (a, b) => a.date.localeCompare(b.date) || CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category] || a.id.localeCompare(b.id),
  );
}

function weeklyCheck(
  date: string,
  plants: PlannedPlant[],
  firstOutdoor: string,
  input: PlanInput,
): { title: string; detail: string } {
  const inGround = plants.filter((p) => p.schedule.plantOut <= date && p.schedule.harvestEnd >= date);
  const harvesting = inGround.filter((p) => p.schedule.harvestStart <= date).map((p) => p.name.toLowerCase());
  const ids = new Set(inGround.map((p) => p.plantId));
  const items: string[] = [];
  const early = date <= addWeeks(firstOutdoor, 4);

  if (harvesting.length) items.push(`Harvest ${list(harvesting.slice(0, 5))}${harvesting.length > 5 ? " and more" : ""}`);
  items.push(
    input.areas.some((a) => a.kind === "containers")
      ? "Water deeply when the top inch of soil is dry (containers may need it daily in heat)"
      : early
        ? "Keep seedlings and new transplants evenly moist"
        : "Water deeply if the top inch of soil is dry (about 1 inch of water a week)",
  );
  if (early) items.push("Watch for slugs and cutworms on young plants");
  else items.push("Check leaves, top and underside, for pests and eggs");
  if (ids.has("tomato") || ids.has("cherry-tomato") || ids.has("paste-tomato")) {
    if (!early) items.push("Tie up tomatoes and pinch out suckers");
  }
  if (["zucchini", "winter-squash", "pumpkin", "cucumber", "cantaloupe", "watermelon"].some((id) => ids.has(id)) && !early) {
    items.push("Scrape squash bug eggs off leaf undersides");
  }
  if (["kale", "broccoli", "cabbage", "bok-choy"].some((id) => ids.has(id))) items.push("Look for green cabbage worms");
  items.push("Pull weeds while they're small");

  return {
    title: harvesting.length ? "Weekly check-in & harvest" : "Weekly garden check-in",
    detail: items.join(" · "),
  };
}
