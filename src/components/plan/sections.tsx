"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  ClipboardCopy,
  Droplets,
  Info,
  Leaf,
  Printer,
  Ruler,
  Sparkles,
  Sprout,
  Sun,
  TriangleAlert,
} from "lucide-react";
import type { Area, BedArea, GardenPlan, PlanInput, PlannedPlant, PlanTask } from "@/lib/garden/types";
import { getPlant, PLANTS_BY_ID } from "@/lib/garden/plants";
import { fmtLong, fmtMMDD, fmtMonth, fmtShort, monthKey } from "@/lib/garden/dates";
import { seasonLengthDays } from "@/lib/garden/climate";
import { BedGrid, ContainerGrid, PlantBadge, SeasonTimeline, plantColor } from "@/components/garden/visuals";
import { TaskItem } from "@/components/garden/tasks";
import { Card, Chip, Stat, cx } from "@/components/ui";

type TaskState = { done: Set<string>; toggle?: (id: string) => void };

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export function OverviewTab({
  plan,
  input,
  today,
  tasks,
  onTab,
}: {
  plan: GardenPlan;
  input: PlanInput;
  today: string;
  tasks: TaskState;
  onTab: (tab: string) => void;
}) {
  const next = plan.tasks.filter((t) => t.date >= today && !tasks.done.has(t.id)).slice(0, 4);
  const c = input.climate;
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        <Card className="p-5 sm:p-6">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-leaf-700">
            {plan.designSource === "ai" ? <Sparkles className="h-4 w-4" /> : <Sprout className="h-4 w-4" />}
            {plan.designSource === "ai" ? "Your plan, designed for you" : "Your plan"}
          </div>
          <p className="text-[17px] leading-relaxed text-ink">{plan.summary}</p>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Crops" value={plan.plants.length} hint={`${plan.stats.plantCount} plants total`} />
            <Stat
              label="Space used"
              value={`${plan.stats.usedSqFt}`}
              hint={`of ${plan.stats.growingSqFt} ${input.areas.some((a) => a.kind === "bed") ? "sq ft" : "pots"}`}
            />
            <Stat label="Est. cost" value={money(plan.stats.estCost)} hint="seeds, plants & supplies" />
            {plan.stats.firstPlanting && <Stat label="First planting" value={fmtShort(plan.stats.firstPlanting)} />}
            {plan.stats.firstHarvest && <Stat label="First harvest" value={fmtShort(plan.stats.firstHarvest)} />}
            <Stat label="Zone" value={c.zone} hint={c.frostFree ? "frost-free" : `${seasonLengthDays(c)} frost-free days`} />
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-xl font-semibold">Your next steps</h3>
            <button type="button" onClick={() => onTab("calendar")} className="text-sm font-semibold text-leaf-700 hover:underline">
              Full calendar
            </button>
          </div>
          {next.length ? (
            <ul className="space-y-2">
              {next.map((t) => (
                <TaskItem key={t.id} task={t} done={tasks.done.has(t.id)} onToggle={tasks.toggle ? () => tasks.toggle!(t.id) : undefined} />
              ))}
            </ul>
          ) : (
            <p className="text-muted">You&apos;re all caught up.</p>
          )}
        </Card>

        {plan.tips.length > 0 && (
          <Card className="p-5 sm:p-6">
            <h3 className="mb-3 font-display text-xl font-semibold">Good to know</h3>
            <ul className="space-y-3">
              {plan.tips.map((tip) => (
                <li key={tip} className="flex gap-3 text-[15px] leading-relaxed">
                  <Leaf className="mt-1 h-4 w-4 shrink-0 text-leaf-500" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <div className="space-y-5">
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-br from-leaf-600 to-leaf-800 p-5 text-white">
            <p className="text-xs font-bold uppercase tracking-widest text-leaf-100">Your climate</p>
            <p className="mt-1 font-display text-3xl font-semibold">Zone {c.zone}</p>
            <p className="text-sm text-leaf-100">
              ZIP {input.zip}
              {c.state ? ` · ${c.state}` : ""}
            </p>
          </div>
          <dl className="divide-y divide-line text-sm">
            {c.frostFree ? (
              <div className="flex justify-between px-5 py-3">
                <dt className="text-muted">Frost</dt>
                <dd className="font-semibold">Rare to none</dd>
              </div>
            ) : (
              <>
                <div className="flex justify-between px-5 py-3">
                  <dt className="text-muted">Last spring frost</dt>
                  <dd className="font-semibold">~{fmtMMDD(c.lastFrost)}</dd>
                </div>
                <div className="flex justify-between px-5 py-3">
                  <dt className="text-muted">First fall frost</dt>
                  <dd className="font-semibold">~{fmtMMDD(c.firstFrost)}</dd>
                </div>
              </>
            )}
            <div className="flex justify-between px-5 py-3">
              <dt className="text-muted">Sun</dt>
              <dd className="font-semibold">{{ full: "Full sun", partial: "Partial sun", shade: "Mostly shade" }[input.sun]}</dd>
            </div>
          </dl>
          <p className="border-t border-line px-5 py-3 text-xs text-faint">
            {c.source === "user"
              ? "Using the frost dates you entered."
              : c.source === "usda-lookup"
                ? "Zone from the USDA hardiness map; frost dates are typical averages for your zone. Local conditions vary by a week or two."
                : "Estimated from your ZIP code region. Check with your local extension office for exact dates."}
          </p>
        </Card>

        {plan.skipped.length > 0 && (
          <Card className="p-5">
            <h3 className="mb-1 font-display text-lg font-semibold">Didn&apos;t make the cut</h3>
            <p className="mb-3 text-sm text-muted">Things we left out, and why.</p>
            <ul className="space-y-3 text-sm">
              {plan.skipped.map((s) => (
                <li key={s.name}>
                  <span className="font-semibold">{s.name}:</span> <span className="text-muted">{s.reason}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function LayoutTab({ plan, input }: { plan: GardenPlan; input: PlanInput }) {
  const [selected, setSelected] = useState<string | null>(null);
  const areaById = new Map<string, Area>(input.areas.map((a) => [a.id, a]));
  const selectedPlant = plan.plants.find((p) => p.plantId === selected) ?? null;
  const counts = new Map(plan.plants.map((p) => [p.plantId, p.quantity]));

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        {plan.layouts.map((layout) => {
          const area = areaById.get(layout.areaId);
          return (
            <Card key={layout.areaId} className="p-4 sm:p-6">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-display text-xl font-semibold">{layout.name}</h3>
                <span className="text-sm text-muted">
                  {layout.kind === "bed"
                    ? `${layout.widthFt} × ${layout.lengthFt} ft ${(area as BedArea | undefined)?.raised ? "raised bed" : "plot"}`
                    : `${layout.pots.length} containers`}
                </span>
              </div>
              {layout.kind === "bed" ? (
                <BedGrid layout={layout} raised={(area as BedArea | undefined)?.raised ?? true} selected={selected} onSelect={setSelected} />
              ) : (
                <ContainerGrid layout={layout} selected={selected} onSelect={setSelected} />
              )}
              {layout.kind === "bed" && (
                <p className="mt-3 flex items-start gap-2 text-sm text-muted">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  Each square is 1 × 1 ft. Turn the plan so the top edge faces north: tall crops won&apos;t shade the rest.
                </p>
              )}
            </Card>
          );
        })}
      </div>
      <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        {selectedPlant ? (
          <PlantCard plant={selectedPlant} compact onClose={() => setSelected(null)} />
        ) : (
          <Card className="p-4 text-sm text-muted">Tap a plant in the layout to see its spacing, dates and tips.</Card>
        )}
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-faint">Legend</h3>
          <ul className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            {plan.plants.map((p) => (
              <li key={p.plantId}>
                <button
                  type="button"
                  onClick={() => setSelected(selected === p.plantId ? null : p.plantId)}
                  className={cx(
                    "flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm transition-colors hover:bg-cream",
                    selected === p.plantId && "bg-sun-50 ring-1 ring-sun-300",
                  )}
                >
                  <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: plantColor(p.plantId) }} />
                  <span className="flex-1 truncate font-medium">{p.name}</span>
                  <span className="text-xs text-faint">×{counts.get(p.plantId)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plants
// ---------------------------------------------------------------------------

export function PlantCard({ plant: pp, compact, onClose }: { plant: PlannedPlant; compact?: boolean; onClose?: () => void }) {
  const p = getPlant(pp.plantId);
  const s = pp.schedule;
  const howMany =
    pp.plantId === "garlic"
      ? `${pp.quantity} cloves`
      : pp.plantId === "potato"
        ? `${pp.quantity} seed pieces`
        : `${pp.quantity} plant${pp.quantity === 1 ? "" : "s"}`;
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <PlantBadge plantId={pp.plantId} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-display text-xl font-semibold leading-tight">{pp.name}</h3>
              {pp.variety && <p className="text-sm text-muted">Try &lsquo;{pp.variety}&rsquo;</p>}
            </div>
            {onClose && (
              <button type="button" onClick={onClose} className="rounded-full px-2 text-sm text-faint hover:text-ink" aria-label="Close">
                ✕
              </button>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip>{howMany}</Chip>
            <Chip tone="neutral">{pp.spacing}</Chip>
            <Chip tone={pp.acquire === "starts" ? "sun" : "leaf"}>
              {pp.acquire === "starts" ? (pp.plantId === "garlic" || pp.plantId === "potato" ? "Buy seed stock" : "Buy plants") : "From seed"}
            </Chip>
            {p.perennial && <Chip tone="sky">Perennial</Chip>}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {s.startIndoors ? (
          <DateBox label="Start indoors" date={s.startIndoors} />
        ) : (
          <DateBox label={pp.acquire === "starts" ? "Buy" : "Get seeds"} date={null} note={pp.acquire === "starts" ? "a week before" : "anytime"} />
        )}
        <DateBox label={s.method === "transplant" ? "Plant out" : "Sow"} date={s.plantOut} />
        <DateBox label={p.category === "flower" ? "Blooms" : "Harvest"} date={s.harvestStart} end={s.harvestEnd} />
      </div>

      <p className="mt-4 text-[15px] leading-relaxed">{pp.reason}</p>

      {s.warnings.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {s.warnings.map((w) => (
            <li key={w} className="flex gap-2 rounded-xl bg-sun-50 px-3 py-2 text-sm text-sun-600">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              {w}
            </li>
          ))}
        </ul>
      )}

      {(s.successions.length > 0 || s.fallSow) && (
        <p className="mt-3 text-sm text-muted">
          {s.successions.length > 0 && <>Sow again: {s.successions.map(fmtShort).join(", ")}. </>}
          {s.fallSow && <>Plant again for fall around {fmtShort(s.fallSow)}.</>}
        </p>
      )}

      {!compact && (
        <details className="group mt-3">
          <summary className="cursor-pointer list-none text-sm font-semibold text-leaf-700">
            <span className="group-open:hidden">Growing tips</span>
            <span className="hidden group-open:inline">Hide tips</span>
          </summary>
          <ul className="mt-2 space-y-2 text-sm leading-relaxed text-muted">
            {p.tips.map((t) => (
              <li key={t} className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-leaf-500" />
                {t}
              </li>
            ))}
            <li className="flex gap-2">
              <Sprout className="mt-0.5 h-4 w-4 shrink-0 text-leaf-500" />
              Expected yield: {p.yield.toLowerCase()}.
            </li>
          </ul>
        </details>
      )}
      {compact && (
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
          {p.tips.slice(0, 2).map((t) => (
            <li key={t} className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-leaf-500" />
              {t}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function DateBox({ label, date, end, note }: { label: string; date: string | null; end?: string; note?: string }) {
  return (
    <div className="rounded-xl bg-cream px-2 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">{label}</p>
      <p className="text-sm font-bold text-ink">{date ? fmtShort(date) : note}</p>
      {end && <p className="text-[11px] text-muted">to {fmtShort(end)}</p>}
    </div>
  );
}

export function PlantsTab({ plan }: { plan: GardenPlan }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {plan.plants.map((p) => (
        <PlantCard key={p.plantId} plant={p} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export function CalendarTab({ plan, today, tasks }: { plan: GardenPlan; today: string; tasks: TaskState }) {
  const [showPast, setShowPast] = useState(false);
  const visible = plan.tasks.filter((t) => showPast || t.date >= today || !tasks.done.has(t.id));
  const byMonth = useMemo(() => {
    const m = new Map<string, PlanTask[]>();
    for (const t of visible) {
      const k = monthKey(t.date);
      m.set(k, [...(m.get(k) ?? []), t]);
    }
    return [...m.entries()];
  }, [visible]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 font-display text-xl font-semibold">Season at a glance</h3>
        <SeasonTimeline plants={plan.plants} today={today} />
      </div>
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-xl font-semibold">Month by month</h3>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} className="h-4 w-4 accent-leaf-600" />
            Show completed
          </label>
        </div>
        <div className="space-y-6">
          {byMonth.map(([month, list]) => (
            <section key={month}>
              <h4 className="sticky top-28 z-10 mb-2 inline-flex items-center gap-2 rounded-full bg-cream/95 px-1 py-1 text-sm font-bold uppercase tracking-wide text-leaf-700 backdrop-blur sm:top-32">
                <CalendarDays className="h-4 w-4" />
                {fmtMonth(`${month}-01`)}
              </h4>
              <ul className="space-y-2">
                {list.map((t) => (
                  <TaskItem
                    key={t.id}
                    task={t}
                    done={tasks.done.has(t.id)}
                    overdue={t.date < today}
                    onToggle={tasks.toggle ? () => tasks.toggle!(t.id) : undefined}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shopping
// ---------------------------------------------------------------------------

export function ShoppingTab({ plan, gardenId }: { plan: GardenPlan; gardenId: string }) {
  const key = `plantr:shop:${gardenId}`;
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from per-device storage after mount
      if (raw) setChecked(new Set(JSON.parse(raw) as string[]));
    } catch {
      // Storage unavailable (private mode): the checklist still works for this visit.
    }
  }, [key]);

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(key, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  }

  const groups = ["Plants & seeds", "Soil & amendments", "Supplies"] as const;
  const total = plan.shopping.reduce((n, i) => n + i.estCost, 0);
  const remaining = plan.shopping.filter((i) => !checked.has(i.id)).reduce((n, i) => n + i.estCost, 0);

  async function copy() {
    const text = groups
      .map((g) => {
        const items = plan.shopping.filter((i) => i.group === g);
        return items.length ? `${g}\n${items.map((i) => `- ${i.name}: ${i.quantity}`).join("\n")}` : "";
      })
      .filter(Boolean)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(`Plantr shopping list\n\n${text}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="space-y-5">
        {groups.map((g) => {
          const items = plan.shopping.filter((i) => i.group === g);
          if (!items.length) return null;
          return (
            <Card key={g} className="p-4 sm:p-5">
              <h3 className="mb-3 font-display text-lg font-semibold">{g}</h3>
              <ul className="divide-y divide-line">
                {items.map((i) => {
                  const on = checked.has(i.id);
                  return (
                    <li key={i.id}>
                      <label className="flex cursor-pointer items-start gap-3 py-3">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(i.id)}
                          className="mt-1 h-5 w-5 shrink-0 rounded accent-leaf-600"
                        />
                        <span className="min-w-0 flex-1">
                          <span className={cx("block font-semibold", on && "text-faint line-through")}>{i.name}</span>
                          <span className="block text-sm text-muted">{i.note}</span>
                        </span>
                        <span className="text-right">
                          <span className="block text-sm font-semibold">{i.quantity}</span>
                          <span className="block text-xs text-faint">~{money(i.estCost)}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })}
      </div>
      <div className="space-y-3 lg:sticky lg:top-20 lg:self-start">
        <Card className="p-5">
          <p className="text-sm text-muted">Estimated total</p>
          <p className="font-display text-4xl font-semibold">{money(total)}</p>
          {checked.size > 0 && <p className="mt-1 text-sm text-leaf-700">{money(remaining)} left to buy</p>}
          <p className="mt-3 text-xs text-faint">Typical U.S. garden-center prices. Seeds go much further than this one season.</p>
          <div className="mt-4 flex gap-2 no-print">
            <button
              type="button"
              onClick={copy}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-line-strong px-3 py-2 text-sm font-semibold hover:bg-leaf-50"
            >
              <ClipboardCopy className="h-4 w-4" />
              {copied ? "Copied!" : "Copy list"}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-line-strong px-3 py-2 text-sm font-semibold hover:bg-leaf-50"
            >
              <Printer className="h-4 w-4" />
              Print
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Care
// ---------------------------------------------------------------------------

export function CareTab({ plan, input }: { plan: GardenPlan; input: PlanInput }) {
  const feeds = plan.tasks.filter((t) => t.id.startsWith("feed:"));
  const containers = input.areas.some((a) => a.kind === "containers");
  const thirsty = plan.plants.filter((p) => getPlant(p.plantId).water === "high").map((p) => p.name.toLowerCase());
  const heavy = plan.plants.filter((p) => getPlant(p.plantId).feeder === "heavy").map((p) => p.name.toLowerCase());
  const supports = plan.plants.filter((p) => getPlant(p.plantId).support);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <CareCard icon={<Droplets className="h-5 w-5" />} title="Watering" tone="sky">
          {containers
            ? "Check containers daily in warm weather and water until it drains out the bottom."
            : "Give beds about 1 inch of water a week: one or two deep soakings, not a daily sprinkle."}{" "}
          Water the soil in the morning, not the leaves.
          {thirsty.length > 0 && <> Extra thirsty: {thirsty.join(", ")}.</>}
        </CareCard>
        <CareCard icon={<Sprout className="h-5 w-5" />} title="Feeding" tone="leaf">
          Mix compost in before planting.{" "}
          {heavy.length > 0
            ? `Then feed the heavy feeders (${heavy.join(", ")}) every 4 weeks with compost or a balanced organic fertilizer.`
            : "Your crops are light feeders, so compost is all they need."}
        </CareCard>
        <CareCard icon={<Sun className="h-5 w-5" />} title="Weekly check-in" tone="sun">
          Once a week: water if dry, pull small weeds, look under leaves for pests and eggs, tie up tall plants, and harvest anything ready. Picking often keeps
          plants producing.
        </CareCard>
      </div>

      {supports.length > 0 && (
        <Card className="p-5">
          <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
            <Ruler className="h-5 w-5 text-leaf-600" />
            Supports to set up
          </h3>
          <ul className="space-y-2 text-[15px]">
            {supports.map((p) => {
              const support = getPlant(p.plantId).support;
              return (
                <li key={p.plantId} className="flex items-center gap-2">
                  <span aria-hidden>{p.emoji}</span>
                  <span className="font-semibold">{p.name}:</span>
                  <span className="text-muted">
                    {support === "cage" ? "a sturdy cage at planting" : support === "stake" ? "a stake at planting" : "a 5–7 ft trellis on the north edge"}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {feeds.length > 0 && (
        <Card className="p-5">
          <h3 className="mb-3 font-display text-lg font-semibold">Feeding schedule</h3>
          <ul className="flex flex-wrap gap-2">
            {feeds.map((f) => (
              <li key={f.id} className="rounded-full bg-leaf-50 px-3 py-1 text-sm font-medium text-leaf-700">
                {fmtShort(f.date)}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="overflow-hidden">
        <h3 className="px-5 pt-5 font-display text-lg font-semibold">Plant by plant</h3>
        <div className="overflow-x-auto">
          <table className="mt-3 w-full min-w-[560px] text-left text-sm">
            <thead className="bg-cream text-xs uppercase tracking-wide text-faint">
              <tr>
                <th className="px-5 py-2 font-semibold">Plant</th>
                <th className="px-3 py-2 font-semibold">Water</th>
                <th className="px-3 py-2 font-semibold">Feeding</th>
                <th className="px-3 py-2 font-semibold">Sun</th>
                <th className="px-3 py-2 font-semibold">Harvest window</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {plan.plants.map((pp) => {
                const p = PLANTS_BY_ID[pp.plantId];
                return (
                  <tr key={pp.plantId}>
                    <td className="px-5 py-2.5 font-semibold">
                      {pp.emoji} {pp.name}
                    </td>
                    <td className="px-3 py-2.5 capitalize text-muted">{p.water}</td>
                    <td className="px-3 py-2.5 capitalize text-muted">{p.feeder}</td>
                    <td className="px-3 py-2.5 text-muted">{p.sun === "full" ? "6+ hrs" : "4+ hrs"}</td>
                    <td className="px-3 py-2.5 text-muted">
                      {fmtShort(pp.schedule.harvestStart)} – {fmtLong(pp.schedule.harvestEnd)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function CareCard({
  icon,
  title,
  tone,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  tone: "sky" | "leaf" | "sun";
  children: React.ReactNode;
}) {
  const tones = { sky: "bg-sky-50 text-sky-500", leaf: "bg-leaf-50 text-leaf-600", sun: "bg-sun-50 text-sun-600" };
  return (
    <Card className="p-5">
      <span className={cx("mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full", tones[tone])}>{icon}</span>
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <p className="mt-1 text-[15px] leading-relaxed text-muted">{children}</p>
    </Card>
  );
}
