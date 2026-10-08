"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
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
import { climateSourceNote, seasonLengthDays } from "@/lib/garden/climate";
import { BedGrid, ContainerGrid, PlantBadge, SeasonTimeline, WindowsillView, plantColor } from "@/components/garden/visuals";
import { INDOOR_WEEKS, WINDOW_LABELS, isIndoor, potInchesForGallons } from "@/lib/garden/indoor";
import { TaskItem } from "@/components/garden/tasks";
import { Card, Chip, Stat, cx } from "@/components/ui";
import { type MerchantId, type ShopConfig, earnsCommission, shopLinks } from "@/lib/shop";

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
  const indoor = isIndoor(input);
  const hasBeds = input.areas.some((a) => a.kind === "bed");
  const potsUsed = plan.layouts.reduce((n, l) => (l.kind === "containers" ? n + l.pots.filter((p) => p.plantId).length : n), 0);
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
              value={`${hasBeds ? plan.stats.usedSqFt + potsUsed : potsUsed}`}
              hint={`of ${plan.stats.growingSqFt} ${hasBeds ? "sq ft" : "pots"}`}
            />
            <Stat label="Est. cost" value={money(plan.stats.estCost)} hint="seeds, plants & supplies" />
            {plan.stats.firstPlanting && <Stat label="First planting" value={fmtShort(plan.stats.firstPlanting)} />}
            {plan.stats.firstHarvest && <Stat label="First harvest" value={fmtShort(plan.stats.firstHarvest)} />}
            {indoor ? (
              <Stat
                label="Light"
                value={input.indoor && input.indoor.window !== "unsure" ? WINDOW_LABELS[input.indoor.window].replace("-facing", "") : "Window"}
                hint={input.indoor?.growLight === "none" ? "window light" : "window + grow light"}
              />
            ) : (
              <Stat label="Zone" value={c.zone} hint={c.frostFree ? "frost-free" : `${seasonLengthDays(c)} frost-free days`} />
            )}
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
        {indoor ? (
          <IndoorSetupCard input={input} />
        ) : (
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
            <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-faint">{climateSourceNote(c)}</p>
          </Card>
        )}

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
  const indoor = isIndoor(input);
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
                    : indoor
                      ? `${layout.pots.length} pots`
                      : `${layout.pots.length} containers`}
                </span>
              </div>
              {layout.kind === "bed" ? (
                <BedGrid layout={layout} raised={(area as BedArea | undefined)?.raised ?? true} selected={selected} onSelect={setSelected} />
              ) : indoor ? (
                <WindowsillView layout={layout} selected={selected} onSelect={setSelected} growLight={input.indoor?.growLight !== "none"} />
              ) : (
                <ContainerGrid layout={layout} selected={selected} onSelect={setSelected} />
              )}
              {indoor && (
                <p className="mt-3 flex items-start gap-2 text-sm text-muted">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  Keep pots within a foot of the glass, sun-lovers in the brightest spot, and turn them a quarter turn every few days.
                </p>
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
          <PlantCard plant={selectedPlant} indoor={indoor} compact onClose={() => setSelected(null)} />
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

export function PlantCard({
  plant: pp,
  indoor = false,
  compact,
  onClose,
}: {
  plant: PlannedPlant;
  indoor?: boolean;
  compact?: boolean;
  onClose?: () => void;
}) {
  const p = getPlant(pp.plantId);
  const s = pp.schedule;
  const howMany =
    pp.plantId === "garlic"
      ? `${pp.quantity} cloves`
      : pp.plantId === "potato"
        ? `${pp.quantity} seed pieces`
        : pp.plantId === "microgreens"
          ? `${pp.quantity} pot${pp.quantity === 1 ? "" : "s"} at a time`
          : `${pp.quantity} plant${pp.quantity === 1 ? "" : "s"}`;
  const scraps = indoor && p.indoor?.start === "scraps";
  // Indoors, the outdoor growing tips (mulch, frost, hilling) don't apply.
  const tips = indoor && p.indoor ? [p.indoor.tip, ...(p.petCaution ? [`Pets: ${p.petCaution}`] : [])] : p.tips;
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
              {scraps
                ? "From kitchen scraps"
                : pp.acquire === "starts"
                  ? pp.plantId === "garlic" || pp.plantId === "potato"
                    ? "Buy seed stock"
                    : "Buy plants"
                  : "From seed"}
            </Chip>
            {p.perennial && !indoor && <Chip tone="sky">Perennial</Chip>}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {s.startIndoors ? (
          <DateBox label="Start indoors" date={s.startIndoors} />
        ) : (
          <DateBox
            label={pp.acquire === "starts" ? "Buy" : "Get seeds"}
            date={null}
            note={pp.acquire === "starts" ? (indoor ? "a few days before" : "a week before") : "anytime"}
          />
        )}
        <DateBox label={s.method === "transplant" ? (indoor ? "Pot up" : "Plant out") : "Sow"} date={s.plantOut} />
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
            {tips.map((t) => (
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
          {tips.slice(0, 2).map((t) => (
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

export function PlantsTab({ plan, input }: { plan: GardenPlan; input: PlanInput }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {plan.plants.map((p) => (
        <PlantCard key={p.plantId} plant={p} indoor={isIndoor(input)} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export function CalendarTab({ plan, today, tasks }: { plan: GardenPlan; today: string; tasks: TaskState }) {
  const indoor = plan.season === "indoor";
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
        <h3 className="mb-3 font-display text-xl font-semibold">
          {indoor ? `The next ${Math.round(INDOOR_WEEKS / 4.3)} months at a glance` : "Season at a glance"}
        </h3>
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

/** Counts a tap on a store link without delaying it: a beacon survives the page opening a new tab. */
function countShopClick(merchant: MerchantId, item: string) {
  const body = JSON.stringify({ merchant, item });
  try {
    if (navigator.sendBeacon?.("/api/shop/click", new Blob([body], { type: "application/json" }))) return;
  } catch {}
  void fetch("/api/shop/click", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
}

export function ShoppingTab({ plan, gardenId, shop }: { plan: GardenPlan; gardenId: string; shop: ShopConfig }) {
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
        {earnsCommission(shop) && (
          <p className="flex gap-2 rounded-2xl bg-paper px-3.5 py-2.5 text-[13px] leading-snug text-muted ring-1 ring-line no-print">
            <Info className="mt-px h-4 w-4 shrink-0 text-leaf-600" aria-hidden />
            <span>
              Plantr may earn a small commission when you buy through these store links, at no extra cost to you.
              {shop.amazonTag ? " As an Amazon Associate, Plantr earns from qualifying purchases." : ""}
            </span>
          </p>
        )}
        {groups.map((g) => {
          const items = plan.shopping.filter((i) => i.group === g);
          if (!items.length) return null;
          return (
            <Card key={g} className="p-4 sm:p-5">
              <h3 className="mb-3 font-display text-lg font-semibold">{g}</h3>
              <ul className="divide-y divide-line">
                {items.map((i) => {
                  const on = checked.has(i.id);
                  const links = on ? [] : shopLinks(i, shop);
                  return (
                    <li key={i.id}>
                      <label className={cx("flex cursor-pointer items-start gap-3 pt-3", links.length ? "pb-2" : "pb-3")}>
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
                      {links.length > 0 && (
                        <div className="flex flex-wrap gap-2 pb-3 pl-8 no-print">
                          {links.map((l) => (
                            <a
                              key={l.merchant}
                              href={l.url}
                              target="_blank"
                              rel={l.affiliate ? "sponsored noopener" : "nofollow noopener"}
                              onClick={() => countShopClick(l.merchant, i.id)}
                              aria-label={`Find ${i.name} at ${l.name} (opens in a new tab)`}
                              className="inline-flex h-8 items-center gap-1 rounded-full border border-line-strong bg-paper px-3 text-[13px] font-semibold text-leaf-700 transition-colors hover:border-leaf-500 hover:bg-leaf-50"
                            >
                              {l.name}
                              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                            </a>
                          ))}
                        </div>
                      )}
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
  if (isIndoor(input)) return <IndoorCareTab plan={plan} input={input} />;
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

const LIGHT_NEEDS = { 1: "Low light is fine", 2: "Medium (east or west)", 3: "Bright (south or grow light)" } as const;

function IndoorCareTab({ plan, input }: { plan: GardenPlan; input: PlanInput }) {
  const feeds = plan.tasks.filter((t) => t.id.startsWith("feed:"));
  const growLight = input.indoor?.growLight !== "none";
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <CareCard icon={<Droplets className="h-5 w-5" />} title="Watering" tone="sky">
          Water when the top inch of mix feels dry, until it runs out the bottom, then empty the saucer after half an hour. Most pots need it every 3–7 days,
          less in winter. Soggy roots kill more indoor plants than anything else.
        </CareCard>
        <CareCard icon={<Sprout className="h-5 w-5" />} title="Feeding" tone="leaf">
          Potting mix runs out of food in about a month. Feed every 4 weeks with an all-purpose liquid fertilizer at half strength. Herbs taste best when you
          don&apos;t overdo it.
        </CareCard>
        <CareCard icon={<Sun className="h-5 w-5" />} title="Light" tone="sun">
          Keep pots within a foot of the glass and turn them a quarter turn every few days.{" "}
          {growLight
            ? "Run the grow light 14–16 hours a day on a timer, 6–12 inches above the leaves."
            : "Growth slows in the short days of winter; a small LED grow light keeps it going."}
        </CareCard>
      </div>

      <Card className="p-5">
        <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
          <TriangleAlert className="h-5 w-5 text-sun-600" />
          Indoor troubles, and quick fixes
        </h3>
        <ul className="space-y-2 text-[15px] leading-relaxed">
          <li>
            <span className="font-semibold">Tiny flies around the pots:</span>{" "}
            <span className="text-muted">fungus gnats. Let the top inch dry out between waterings and add a yellow sticky card.</span>
          </li>
          <li>
            <span className="font-semibold">Tall, pale, floppy stems:</span>{" "}
            <span className="text-muted">not enough light. Move closer to the glass, or add a grow light.</span>
          </li>
          <li>
            <span className="font-semibold">Sticky leaves or fine webbing:</span>{" "}
            <span className="text-muted">aphids or spider mites. Rinse the plant in the sink and wipe leaves with mild soapy water.</span>
          </li>
          <li>
            <span className="font-semibold">Crispy leaf edges in winter:</span>{" "}
            <span className="text-muted">dry heated air. Group pots together or set them on a tray of pebbles and water.</span>
          </li>
        </ul>
      </Card>

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
                <th className="px-3 py-2 font-semibold">Light</th>
                <th className="px-3 py-2 font-semibold">Pets</th>
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
                    <td className="px-3 py-2.5 text-muted">{p.indoor ? LIGHT_NEEDS[p.indoor.light] : "-"}</td>
                    <td className="px-3 py-2.5 text-muted">{p.petCaution ? "Keep away from pets" : "Pet-friendly"}</td>
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

function IndoorSetupCard({ input }: { input: PlanInput }) {
  const setup = input.indoor;
  const pots = input.areas.filter((a) => a.kind === "containers");
  const rows: [string, string][] = [
    ["Window", setup ? (setup.window === "unsure" ? "Not sure" : WINDOW_LABELS[setup.window]) : "Window"],
    ["Grow light", setup?.growLight === "have" ? "Yes" : setup?.growLight === "buy" ? "Getting one" : "No"],
    [
      "Pots",
      pots
        .map((p) => (p.kind === "containers" ? `${p.count} × ${p.potIn ?? potInchesForGallons(p.gallons)}-inch` : ""))
        .join(", "),
    ],
    ["Pets", setup?.pets ? "Yes, pet-safe picks" : "No"],
  ];
  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-br from-leaf-600 to-leaf-800 p-5 text-white">
        <p className="text-xs font-bold uppercase tracking-widest text-leaf-100">Your setup</p>
        <p className="mt-1 font-display text-3xl font-semibold">Indoors 🪟</p>
        <p className="text-sm text-leaf-100">
          ZIP {input.zip}
          {input.climate.state ? ` · ${input.climate.state}` : ""}
        </p>
      </div>
      <dl className="divide-y divide-line text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 px-5 py-3">
            <dt className="text-muted">{k}</dt>
            <dd className="text-right font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-faint">
        Indoors, light sets the pace, not frost. Dates run from when you start, at room temperature.
      </p>
    </Card>
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
