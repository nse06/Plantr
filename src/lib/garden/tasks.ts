import type { PlanInput, PlannedPlant, PlanTask, TaskCategory } from "./types";
import { getPlant } from "./plants";
import { addDays, addWeeks, fmtShort, maxISO, minISO, nextSaturday } from "./dates";
import type { SeasonContext } from "./schedule";
import { indoorLight } from "./indoor";

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
  if (ctx.season === "indoor") return buildIndoorTasks(plants, input, ctx);
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

// ---------------------------------------------------------------------------
// Indoor gardens: no frost, no beds. Pots, light, watering and re-sowing.
// ---------------------------------------------------------------------------

function indoorBuyTask(p: PlannedPlant): { title: string; detail: string } {
  if (p.plantId === "basil" && p.quantity > 1) {
    const pots = Math.max(1, Math.ceil(p.quantity / 3));
    return {
      title: `Buy ${pots === 1 ? "a potted basil plant" : `${pots} potted basil plants`}`,
      detail: `Grocery-store basil is several seedlings crammed into one pot. Tease it apart into ${Math.min(p.quantity, 3 * pots)} clumps and pot them up separately.`,
    };
  }
  return {
    title: `Buy ${plantsLabel(p.quantity, p.name)}`,
    detail: `Small potted plants from a garden center or grocery store are the quickest start${p.variety ? ` ('${p.variety}' or similar)` : ""}. Pick bushy ones without yellow leaves.`,
  };
}

function indoorSowDetail(p: PlannedPlant): string {
  if (p.plantId === "microgreens") {
    return "Scatter seeds thickly over damp mix, press them in, and keep the pot covered and dark for 2–3 days. Then move it to the light.";
  }
  if (p.plantId === "cherry-tomato" || p.plantId === "hot-pepper") {
    return "Sow 2–3 seeds ¼ inch deep and keep the pot warm (75–80°F; the top of the fridge works). Once they sprout, put them under the grow light and keep the strongest seedling.";
  }
  return `Sow a few seeds ¼ inch deep in moist mix and cover the pot loosely with a plastic bag until they sprout. Thin to ${p.spacing}.`;
}

function buildIndoorTasks(plants: PlannedPlant[], input: PlanInput, ctx: SeasonContext): PlanTask[] {
  const tasks: PlanTask[] = [];
  const add = (t: PlanTask) => tasks.push({ ...t, date: maxISO(t.date, ctx.today) });
  if (plants.length === 0) return tasks;

  const start = minISO(...plants.map((p) => p.schedule.plantOut));
  const end = maxISO(...plants.map((p) => p.schedule.harvestEnd));
  const setup = input.indoor;

  add({
    id: `prep:pots:${start}`,
    date: addDays(start, -3),
    title: input.bedsReady ? "Check your pots and mix" : "Get pots, saucers and potting mix",
    detail: input.bedsReady
      ? "Make sure every pot has a drainage hole and a saucer, and refresh tired mix with a few handfuls of new potting mix."
      : "Every pot needs a drainage hole and a saucer underneath. Fill them with fresh indoor potting mix (never garden soil) and water it in.",
    category: "prep",
    plantId: null,
  });
  if (setup && setup.growLight !== "none") {
    add({
      id: `prep:light:${start}`,
      date: addDays(start, -1),
      title: setup.growLight === "buy" ? "Set up your grow light" : "Get your grow light ready",
      detail: "Hang it 6–12 inches above where the leaves will be and plug it into an outlet timer set for 14–16 hours a day. Raise it as the plants grow.",
      category: "prep",
      plantId: null,
    });
  }

  for (const p of plants) {
    const plant = getPlant(p.plantId);
    const rule = plant.indoor;
    const s = p.schedule;
    if (rule?.start === "scraps") {
      add({
        id: `plant:${p.plantId}:${s.plantOut}`,
        date: s.plantOut,
        title: "Regrow green onions from scraps",
        detail: `Buy ${p.quantity > 8 ? `${Math.ceil(p.quantity / 8)} bunches` : "a bunch"} of green onions and use the tops. Plant ${p.quantity} of the white root ends 1 inch deep and 1 inch apart, and new greens appear within a week.`,
        category: "plant",
        plantId: p.plantId,
      });
    } else if (p.acquire === "starts") {
      add({ id: `buy:${p.plantId}:${s.plantOut}`, date: addDays(s.plantOut, -3), ...indoorBuyTask(p), category: "prep", plantId: p.plantId });
      add({
        id: `plant:${p.plantId}:${s.plantOut}`,
        date: s.plantOut,
        title: `Pot up ${plantsLabel(p.quantity, p.name)}`,
        detail: `${p.spacing.charAt(0).toUpperCase()}${p.spacing.slice(1)}. Plant them at the depth they were growing, firm the mix, and water until it drains from the bottom.`,
        category: "plant",
        plantId: p.plantId,
      });
    } else {
      add({
        id: `sow:${p.plantId}:${s.plantOut}`,
        date: s.plantOut,
        title: p.plantId === "microgreens" ? "Sow your first microgreens" : `Sow ${seedsLabel(p.name)}`,
        detail: indoorSowDetail(p),
        category: "plant",
        plantId: p.plantId,
      });
    }
    for (const d of s.successions) {
      add({
        id: `succession:${p.plantId}:${d}`,
        date: d,
        title: p.plantId === "microgreens" ? "Sow another round of microgreens" : `Sow a fresh pot of ${p.name.toLowerCase()}`,
        detail:
          p.plantId === "microgreens"
            ? "Clear out the last batch, add fresh mix and sow again so a new crop is ready as you finish the old one."
            : "Compost the spent plants, refill with fresh mix and sow again so there's always some ready to pick.",
        category: "plant",
        plantId: p.plantId,
      });
    }
    if (rule?.growLightOnly && plant.category !== "herb") {
      const d = addDays(s.harvestStart, -35);
      add({
        id: `pollinate:${p.plantId}:${d}`,
        date: d,
        title: `Hand-pollinate ${p.name.toLowerCase()} flowers`,
        detail: "There are no bees indoors. Every couple of days, tap each open flower with a small paintbrush or give the stems a gentle shake.",
        category: "care",
        plantId: p.plantId,
      });
    }
    const fruit = plant.category === "fruit" || p.plantId === "cherry-tomato" || p.plantId === "hot-pepper";
    add({
      id: `harvest:${p.plantId}:${s.harvestStart}`,
      date: s.harvestStart,
      title:
        p.plantId === "microgreens"
          ? "First microgreens ready to snip"
          : plant.category === "herb"
            ? `Start snipping ${p.name.toLowerCase()}`
            : fruit
              ? `${p.name}: first ripe fruit`
              : `${p.name} ready to pick`,
      detail: `Harvest from about ${fmtShort(s.harvestStart)}${s.harvestEnd > s.harvestStart ? ` to ${fmtShort(s.harvestEnd)}` : ""}. ${rule?.tip ?? plant.yield}`,
      category: "harvest",
      plantId: p.plantId,
    });
  }

  // Potting mix runs out of food in about a month.
  for (let d = nextSaturday(addWeeks(start, 4)); d <= addWeeks(end, -2); d = addWeeks(d, 4)) {
    add({
      id: `feed:${d}`,
      date: d,
      title: "Feed your indoor plants",
      detail: "Water with an all-purpose liquid fertilizer mixed at half strength. Herbs taste best when you don't overdo it.",
      category: "care",
      plantId: null,
    });
  }

  const weeklyStart = nextSaturday(addDays(start, 3));
  for (let d = weeklyStart; d <= minISO(end, addWeeks(weeklyStart, 30)); d = addWeeks(d, 1)) {
    add({ id: `weekly:${d}`, ...indoorWeeklyCheck(d, plants, start, input), category: "care", plantId: null, date: d });
  }

  add({
    id: `wrapup:indoor:${end}`,
    date: addDays(end, 3),
    title: "Refresh your indoor garden",
    detail: "Cut back or replace tired plants, top up the pots with fresh mix, and plan your next round in Plantr.",
    category: "prep",
    plantId: null,
  });

  return tasks.sort(
    (a, b) => a.date.localeCompare(b.date) || CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category] || a.id.localeCompare(b.id),
  );
}

function indoorWeeklyCheck(date: string, plants: PlannedPlant[], start: string, input: PlanInput): { title: string; detail: string } {
  const growing = plants.filter((p) => p.schedule.plantOut <= date && p.schedule.harvestEnd >= date);
  const harvesting = growing.filter((p) => p.schedule.harvestStart <= date).map((p) => p.name.toLowerCase());
  const ids = new Set(growing.map((p) => p.plantId));
  const items: string[] = [];
  const early = date <= addWeeks(start, 3);
  const month = Number(date.slice(5, 7));
  const winter = month >= 11 || month <= 2;

  if (harvesting.length) items.push(`Snip ${list(harvesting.slice(0, 5))}${harvesting.length > 5 ? " and more" : ""}`);
  items.push("Water when the top inch of mix is dry, then empty the saucers");
  if (early && growing.some((p) => p.acquire === "seeds")) items.push("Keep newly sown pots moist until the seeds sprout");
  items.push("Turn each pot a quarter turn so plants grow straight");
  items.push(
    Number(date.slice(8, 10)) % 2 === 0
      ? "Check under leaves for aphids and spider mites"
      : "Gnats around the pots? Let the top inch dry out and add a yellow sticky card",
  );
  if (ids.has("basil")) items.push("Pinch basil tips and any flower buds");
  if (winter && input.indoor?.growLight === "none" && indoorLight(input.indoor) < 3) {
    items.push("Keep leaves off the cold glass on frosty nights");
  }
  return {
    title: harvesting.length ? "Weekly check-in & harvest" : "Weekly windowsill check-in",
    detail: items.join(" · "),
  };
}
