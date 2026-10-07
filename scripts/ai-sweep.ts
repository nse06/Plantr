import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "../src/db";
import { getClimate } from "../src/lib/server/climate";
import { seasonOptions } from "../src/lib/garden/schedule";
import { buildPlan, planContext } from "../src/lib/garden/plan";
import { designWithAI } from "../src/lib/ai/design";
import { aiEnabled } from "../src/lib/ai/client";
import { todayISO } from "../src/lib/garden/dates";
import type { Area, Design, PlanInput } from "../src/lib/garden/types";

// Compare AI design settings (effort levels, or models) on a fixed set of sample gardens, to
// check whether a cheaper setting keeps the quality. Every call spends real API money, so
// nothing is sent without --yes.
//
//   npm run ai:sweep                                   show the plan and an estimated cost
//   npm run ai:sweep -- --yes                          low vs medium effort on 6 sample gardens
//   npm run ai:sweep -- --yes --efforts low,medium,high
//   npm run ai:sweep -- --yes --efforts low --models claude-opus-5-5,claude-sonnet-5-5
//
// Results are printed side by side; read the plans, not just the numbers. Each call is logged
// to ai_usage like any other (with the cache off, so every setting gets a fresh answer).

type Sample = { name: string; zip: string; input: Omit<PlanInput, "zip" | "climate" | "season" | "year"> };

const bed = (widthFt: number, lengthFt: number, raised = true): Area => ({ kind: "bed", id: `b${widthFt}${lengthFt}`, name: "Bed", widthFt, lengthFt, raised });
const pots = (count: number, gallons: number, potIn?: number): Area => ({ kind: "containers", id: `c${count}`, name: "Pots", count, gallons, potIn });
const base = { wants: [] as string[], notes: "", bedsReady: false, photo: null, indoor: null };

const SAMPLES: Sample[] = [
  {
    name: "Chicago salad bed",
    zip: "60614",
    input: { ...base, spaceType: "raised-bed", areas: [bed(4, 8)], sun: "full", goals: ["salad", "herbs"], household: 2, experience: "new", time: "moderate" },
  },
  {
    name: "Austin salsa beds",
    zip: "78704",
    input: {
      ...base,
      spaceType: "raised-bed",
      areas: [bed(4, 8), bed(4, 8)],
      sun: "full",
      goals: ["salsa"],
      notes: "We love spicy food and make salsa every weekend.",
      household: 4,
      experience: "some",
      time: "moderate",
    },
  },
  {
    name: "Seattle balcony",
    zip: "98103",
    input: {
      ...base,
      spaceType: "containers",
      areas: [pots(6, 5)],
      sun: "partial",
      goals: ["herbs", "salad"],
      notes: "Small balcony that gets afternoon sun.",
      household: 1,
      experience: "new",
      time: "minimal",
    },
  },
  {
    name: "Denver family plot",
    zip: "80205",
    input: {
      ...base,
      spaceType: "in-ground",
      areas: [bed(10, 12, false)],
      sun: "full",
      goals: ["preserving", "kids"],
      notes: "The kids want pumpkins and strawberries.",
      household: 5,
      experience: "experienced",
      time: "plenty",
    },
  },
  {
    name: "Atlanta bed + pots",
    zip: "30307",
    input: { ...base, spaceType: "mixed", areas: [bed(4, 4), pots(4, 3)], sun: "full", goals: ["pollinators", "low-maintenance"], household: 2, experience: "new", time: "minimal" },
  },
  {
    name: "NYC windowsill",
    zip: "10025",
    input: {
      ...base,
      spaceType: "indoor",
      areas: [pots(6, 0.6, 6)],
      sun: "full",
      goals: ["herbs"],
      notes: "We cook a lot of Italian food.",
      household: 2,
      experience: "new",
      time: "moderate",
      indoor: { window: "south", growLight: "none", pets: true },
    },
  },
];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const efforts = (arg("efforts") ?? "low,medium").split(",").filter(Boolean);
const models = (arg("models") ?? (process.env.PLANTR_DESIGN_MODEL || process.env.PLANTR_MODEL || "claude-opus-5-5")).split(",").filter(Boolean);
const settings = models.flatMap((model) => efforts.map((effort) => ({ model, effort, label: `${model} / ${effort}` })));
const limit = Number(arg("samples") ?? SAMPLES.length);
const samples = SAMPLES.slice(0, limit);

type Result = {
  sample: string;
  setting: string;
  design: Design | null;
  plants: string;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  costUsd: number;
  ms: number;
};

async function main() {
  const calls = samples.length * settings.length;
  console.log(`AI design sweep: ${samples.length} sample gardens × ${settings.length} settings = ${calls} calls`);
  for (const s of settings) console.log(`  - ${s.label}`);
  console.log(`Rough cost: $${(calls * 0.02).toFixed(2)}–$${(calls * 0.15).toFixed(2)}, depending on model and effort.`);
  if (!process.argv.includes("--yes")) {
    console.log("\nNothing sent. Add --yes to run it.");
    return;
  }
  if (!aiEnabled()) throw new Error("Set ANTHROPIC_API_KEY first.");
  process.env.PLANTR_AI_CACHE = "off";

  const today = todayISO();
  const results: Result[] = [];
  for (const sample of samples) {
    const climate = await getClimate(sample.zip);
    if (!climate) {
      console.warn(`Skipping ${sample.name}: unknown ZIP ${sample.zip}`);
      continue;
    }
    const indoor = sample.input.spaceType === "indoor";
    const option = indoor ? { season: "indoor" as const, year: Number(today.slice(0, 4)) } : seasonOptions(climate, today)[0];
    const input: PlanInput = { ...sample.input, zip: sample.zip, climate, season: option.season, year: option.year };
    const { ctx, evaluation } = planContext(input, today);

    for (const s of settings) {
      process.env.PLANTR_DESIGN_MODEL = s.model;
      process.env.PLANTR_DESIGN_EFFORT = s.effort;
      const started = Date.now();
      const design = await designWithAI(input, ctx, evaluation);
      const ms = Date.now() - started;
      const [usage] = await getDb()
        .select()
        .from(schema.aiUsage)
        .where(eq(schema.aiUsage.feature, "design"))
        .orderBy(desc(schema.aiUsage.id))
        .limit(1);
      const plan = design ? buildPlan(input, design, today) : null;
      results.push({
        sample: sample.name,
        setting: s.label,
        design,
        plants: plan ? plan.plants.map((p) => `${p.quantity} ${p.name.toLowerCase()}`).join(", ") : "(no design: failed, refused or over budget)",
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        thinkingTokens: usage?.thinkingTokens ?? 0,
        costUsd: usage?.costUsd ?? 0,
        ms,
      });
      console.log(`  ${sample.name} · ${s.label}: ${design ? "ok" : "no design"} in ${(ms / 1000).toFixed(1)}s, $${(usage?.costUsd ?? 0).toFixed(4)}`);
    }
  }

  console.log("\nAverages per setting");
  console.table(
    settings.map((s) => {
      const rows = results.filter((r) => r.setting === s.label);
      const avg = (f: (r: Result) => number) => rows.reduce((n, r) => n + f(r), 0) / Math.max(1, rows.length);
      return {
        setting: s.label,
        designs: `${rows.filter((r) => r.design).length}/${rows.length}`,
        "avg in": Math.round(avg((r) => r.inputTokens)),
        "avg out": Math.round(avg((r) => r.outputTokens)),
        "of which thinking": Math.round(avg((r) => r.thinkingTokens)),
        "avg cost": `$${avg((r) => r.costUsd).toFixed(4)}`,
        "avg secs": (avg((r) => r.ms) / 1000).toFixed(1),
      };
    }),
  );

  console.log("\nPlans side by side (compare the picks, quantities and explanations)");
  for (const sample of samples) {
    console.log(`\n## ${sample.name}`);
    const first = results.find((r) => r.sample === sample.name && r.design);
    for (const r of results.filter((x) => x.sample === sample.name)) {
      const overlap = first?.design && r.design ? jaccard(first.design, r.design) : null;
      console.log(`\n[${r.setting}]${overlap !== null && r !== first ? ` (${Math.round(overlap * 100)}% same crops as ${first!.setting})` : ""}`);
      console.log(`  Plants: ${r.plants}`);
      if (r.design) {
        console.log(`  Summary: ${r.design.summary}`);
        for (const sel of r.design.selections.slice(0, 4)) console.log(`  - ${sel.plantId} ('${sel.variety}'): ${sel.reason}`);
        if (r.design.skipped.length) console.log(`  Skipped: ${r.design.skipped.map((x) => `${x.name} (${x.reason})`).join("; ")}`);
      }
    }
  }
}

function jaccard(a: Design, b: Design): number {
  const x = new Set(a.selections.map((s) => s.plantId));
  const y = new Set(b.selections.map((s) => s.plantId));
  const both = [...x].filter((id) => y.has(id)).length;
  return both / new Set([...x, ...y]).size;
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
