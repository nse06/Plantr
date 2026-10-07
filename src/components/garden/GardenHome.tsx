"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArrowRight, CalendarDays, LayoutGrid, MessageCircle, NotebookPen, Pencil, Scale, Send, Sparkles, Trash2, X } from "lucide-react";
import type { GardenPlan, PlanInput } from "@/lib/garden/types";
import type { JournalEntry } from "@/db/schema";
import { fmtDay, fmtShort, todayISO } from "@/lib/garden/dates";
import { isOverdue, progress, seasonLabel, seasonOver, upcomingTasks, weekTasks } from "@/lib/garden/progress";
import { PLANTS_BY_ID } from "@/lib/garden/plants";
import { PlantBadge, plantStage } from "./visuals";
import { TaskItem, useTaskDone } from "./tasks";
import { Button, ButtonLink, Card, Chip, Spinner, buttonClass, cx } from "@/components/ui";

export interface GardenHomeProps {
  garden: { id: string; name: string; photo: string | null; status: "draft" | "active" | "archived" };
  input: PlanInput;
  plan: GardenPlan;
  doneTaskIds: string[];
  journal: JournalEntry[];
  aiEnabled: boolean;
  serverToday: string;
  welcome: boolean;
}

export function GardenHome({ garden, input, plan, doneTaskIds, journal: initialJournal, aiEnabled, serverToday, welcome }: GardenHomeProps) {
  const router = useRouter();
  const [today, setToday] = useState(serverToday);
  const tasks = useTaskDone(garden.id, doneTaskIds, true);
  const [name, setName] = useState(garden.name);
  const [editingName, setEditingName] = useState(false);
  const [showWelcome, setShowWelcome] = useState(welcome);

  useEffect(() => {
    const local = todayISO();
    queueMicrotask(() => {
      if (local !== serverToday) setToday(local);
    });
    if (welcome) history.replaceState(null, "", `/garden/${garden.id}`);
  }, [serverToday, welcome, garden.id]);

  const week = useMemo(() => weekTasks(plan, tasks.done, today), [plan, tasks.done, today]);
  const later = useMemo(() => upcomingTasks(plan, today).slice(0, 6), [plan, today]);
  // Planning ahead (e.g. a spring plan made in fall): show what's next, however far off.
  const nextUp = useMemo(
    () => (week.length || later.length ? [] : plan.tasks.filter((t) => t.date >= today && !tasks.done.has(t.id)).slice(0, 3)),
    [week.length, later.length, plan.tasks, today, tasks.done],
  );
  const daysToStart = nextUp.length ? Math.round((Date.parse(nextUp[0].date) - Date.parse(today)) / 86_400_000) : 0;
  const prog = progress(plan, tasks.done, today);
  const pct = prog.total ? Math.round((prog.done / prog.total) * 100) : 0;
  const over = seasonOver(plan, today);

  async function saveName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === garden.name) {
      setName(garden.name);
      setEditingName(false);
      return;
    }
    const res = await fetch(`/api/gardens/${garden.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    }).catch(() => null);
    if (!res?.ok) setName(garden.name);
    setEditingName(false);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
      {showWelcome && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl bg-leaf-600 p-4 text-white shadow-[var(--shadow-lift)] animate-rise">
          <span className="text-2xl" aria-hidden>
            🎉
          </span>
          <div className="flex-1">
            <p className="font-semibold">Your garden is saved!</p>
            <p className="text-sm text-leaf-100">
              Each week we&apos;ll email you what to do. Check things off here as you go. You can change emails anytime in your account.
            </p>
          </div>
          <button type="button" onClick={() => setShowWelcome(false)} aria-label="Dismiss" className="rounded-full p-1 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          {garden.photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- small data-URL thumbnail
            <img src={garden.photo} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover ring-1 ring-line sm:h-20 sm:w-20" />
          ) : (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-leaf-100 text-3xl sm:h-20 sm:w-20">🌱</span>
          )}
          <div className="min-w-0">
            {editingName ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveName();
                }}
              >
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 60))}
                  onBlur={() => void saveName()}
                  className="w-full rounded-xl border border-leaf-400 bg-paper px-2 font-display text-3xl font-semibold focus:outline-none"
                  aria-label="Garden name"
                />
              </form>
            ) : (
              <button type="button" onClick={() => setEditingName(true)} className="group flex items-center gap-2 text-left">
                <h1 className="font-display text-3xl font-semibold leading-tight sm:text-4xl">{name}</h1>
                <Pencil className="h-4 w-4 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            )}
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Chip>{plan.season === "indoor" ? "🪟 Indoors" : `Zone ${input.climate.zone}`}</Chip>
              <Chip tone="neutral">{seasonLabel(plan)}</Chip>
              {garden.status === "archived" && <Chip tone="clay">Archived</Chip>}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/plan/${garden.id}#layout`} className={buttonClass("secondary", "sm")}>
            <LayoutGrid className="h-4 w-4" /> Layout
          </Link>
          <Link href={`/plan/${garden.id}#calendar`} className={buttonClass("secondary", "sm")}>
            <CalendarDays className="h-4 w-4" /> Full plan
          </Link>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="space-y-8">
          {over && (
            <Card className="flex flex-col gap-4 bg-gradient-to-br from-sun-50 to-paper p-5 sm:flex-row sm:items-center">
              <span className="text-4xl" aria-hidden>
                {plan.season === "indoor" ? "🪴" : "🍂"}
              </span>
              <div className="flex-1">
                <p className="font-display text-xl font-semibold">
                  {plan.season === "indoor" ? "Time to refresh your windowsill" : "This season is wrapping up"}
                </p>
                <p className="text-sm text-muted">Plan what comes next while it&apos;s fresh. Your notes and harvests below will help.</p>
              </div>
              <ButtonLink href={plan.season === "indoor" ? "/plan/new?space=indoor" : "/plan/new"} variant="primary">
                {plan.season === "indoor" ? "Plan the next round" : "Plan next season"} <ArrowRight className="h-4 w-4" />
              </ButtonLink>
            </Card>
          )}

          <section>
            <h2 className="mb-3 font-display text-2xl font-semibold">This week</h2>
            {week.length ? (
              <ul className="space-y-2">
                {week.map((t) => (
                  <TaskItem key={t.id} task={t} done={tasks.done.has(t.id)} overdue={isOverdue(t, today)} onToggle={() => tasks.toggle(t.id)} />
                ))}
              </ul>
            ) : (
              <Card className="p-5 text-muted">Nothing due this week. Enjoy the garden! 🌻</Card>
            )}
            {tasks.error && <p className="mt-2 text-sm text-clay-700">{tasks.error}</p>}
          </section>

          {nextUp.length > 0 && (
            <section>
              <h2 className="mb-1 font-display text-xl font-semibold text-muted">Next up</h2>
              <p className="mb-3 text-sm text-muted">
                Your garden season kicks off in {daysToStart >= 14 ? `about ${Math.round(daysToStart / 7)} weeks` : `${daysToStart} days`}. We&apos;ll
                email you when it&apos;s time.
              </p>
              <ul className="space-y-2">
                {nextUp.map((t) => (
                  <TaskItem key={t.id} task={t} done={tasks.done.has(t.id)} onToggle={() => tasks.toggle(t.id)} />
                ))}
              </ul>
            </section>
          )}

          {later.length > 0 && (
            <section>
              <h2 className="mb-3 font-display text-xl font-semibold text-muted">Coming up</h2>
              <ul className="space-y-2">
                {later.map((t) => (
                  <TaskItem key={t.id} task={t} done={tasks.done.has(t.id)} onToggle={() => tasks.toggle(t.id)} />
                ))}
              </ul>
              <Link href={`/plan/${garden.id}#calendar`} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-leaf-700 hover:underline">
                See the whole calendar <ArrowRight className="h-4 w-4" />
              </Link>
            </section>
          )}

          <HarvestLog gardenId={garden.id} plan={plan} initial={initialJournal} today={today} />
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex items-center gap-4">
              <ProgressRing pct={pct} />
              <div>
                <p className="font-display text-lg font-semibold">Season progress</p>
                <p className="text-sm text-muted">
                  {prog.done} of {prog.total} tasks done
                </p>
                {plan.stats.firstHarvest && today < plan.stats.firstHarvest && (
                  <p className="mt-1 text-sm text-leaf-700">First harvest around {fmtShort(plan.stats.firstHarvest)}</p>
                )}
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 font-display text-lg font-semibold">In your garden</h2>
            <ul className="space-y-2.5">
              {plan.plants.map((p) => {
                const stage = plantStage(p, today);
                return (
                  <li key={p.plantId} className="flex items-center gap-3">
                    <PlantBadge plantId={p.plantId} size="sm" />
                    <span className="flex-1 truncate text-sm font-medium">
                      {p.name} <span className="text-faint">×{p.quantity}</span>
                    </span>
                    <Chip tone={stage.tone}>{stage.label}</Chip>
                  </li>
                );
              })}
            </ul>
          </Card>

          {aiEnabled && <AskPlantr gardenId={garden.id} today={today} />}

          <ManageGarden gardenId={garden.id} archived={garden.status === "archived"} />
        </div>
      </div>
    </div>
  );
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16 shrink-0 -rotate-90" aria-label={`${pct}% complete`}>
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--color-line)" strokeWidth="7" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke="var(--color-leaf-500)"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c - (pct / 100) * c}
        style={{ transition: "stroke-dashoffset .6s ease" }}
      />
      <text x="32" y="37" textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--color-ink)" transform="rotate(90 32 32)">
        {pct}%
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Harvest log & notes
// ---------------------------------------------------------------------------

const UNITS = [
  { id: "lb", label: "lb" },
  { id: "oz", label: "oz" },
  { id: "count", label: "pieces" },
  { id: "bunch", label: "bunches" },
  { id: "cup", label: "cups" },
] as const;

function HarvestLog({ gardenId, plan, initial, today }: { gardenId: string; plan: GardenPlan; initial: JournalEntry[]; today: string }) {
  const [entries, setEntries] = useState(initial);
  const [mode, setMode] = useState<"harvest" | "note">("harvest");
  const [plantId, setPlantId] = useState(plan.plants[0]?.plantId ?? "");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<(typeof UNITS)[number]["id"]>("lb");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const e of entries) {
      if (e.kind !== "harvest" || !e.plantId || e.amount == null || !e.unit) continue;
      if (!m.has(e.plantId)) m.set(e.plantId, new Map());
      const byUnit = m.get(e.plantId)!;
      byUnit.set(e.unit, (byUnit.get(e.unit) ?? 0) + e.amount);
    }
    return [...m.entries()];
  }, [entries]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body =
      mode === "harvest"
        ? { kind: "harvest", date: today, plantId, amount: amount ? Number(amount) : null, unit: amount ? unit : null, note: note || null }
        : { kind: "note", date: today, note };
    const res = await fetch(`/api/gardens/${gardenId}/journal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { entry?: JournalEntry; error?: string } | null;
    if (res?.ok && data?.entry) {
      setEntries((prev) => [data.entry!, ...prev]);
      setAmount("");
      setNote("");
    } else setError(data?.error ?? "Couldn't save that. Try again.");
    setBusy(false);
  }

  async function remove(id: string) {
    const prev = entries;
    setEntries((list) => list.filter((e) => e.id !== id));
    const res = await fetch(`/api/gardens/${gardenId}/journal?entry=${id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) setEntries(prev);
  }

  const unitLabel = (u: string | null) => UNITS.find((x) => x.id === u)?.label ?? u ?? "";

  return (
    <section>
      <h2 className="mb-3 font-display text-2xl font-semibold">Harvest log & notes</h2>
      <Card className="p-4 sm:p-5">
        <div className="mb-3 inline-flex rounded-full bg-cream p-1">
          {(["harvest", "note"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cx("inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold", mode === m ? "bg-paper shadow-sm" : "text-muted")}
            >
              {m === "harvest" ? <Scale className="h-4 w-4" /> : <NotebookPen className="h-4 w-4" />}
              {m === "harvest" ? "Log a harvest" : "Add a note"}
            </button>
          ))}
        </div>
        <form onSubmit={add} className="space-y-3">
          {mode === "harvest" ? (
            <div className="grid grid-cols-[1fr_auto_auto] gap-2 max-sm:grid-cols-2">
              <select
                value={plantId}
                onChange={(e) => setPlantId(e.target.value)}
                className="h-11 min-w-0 rounded-xl border border-line-strong bg-paper px-3 max-sm:col-span-2"
                aria-label="Plant"
              >
                {plan.plants.map((p) => (
                  <option key={p.plantId} value={p.plantId}>
                    {p.emoji} {p.name}
                  </option>
                ))}
              </select>
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, "").slice(0, 7))}
                placeholder="Amount"
                className="h-11 w-full min-w-0 rounded-xl border border-line-strong bg-paper px-3 sm:w-28"
                aria-label="Amount"
              />
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as typeof unit)}
                className="h-11 rounded-xl border border-line-strong bg-paper px-3"
                aria-label="Unit"
              >
                {UNITS.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 1000))}
            rows={2}
            placeholder={mode === "harvest" ? "Optional note (e.g. first ripe tomato!)" : "What happened in the garden today?"}
            className="w-full rounded-xl border border-line-strong bg-paper p-3 text-[15px]"
          />
          {error && <p className="text-sm text-clay-700">{error}</p>}
          <Button type="submit" disabled={busy || (mode === "note" && !note.trim()) || (mode === "harvest" && !plantId)}>
            {busy ? <Spinner className="h-4 w-4" /> : null}
            {mode === "harvest" ? "Log harvest" : "Save note"}
          </Button>
        </form>
      </Card>

      {totals.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {totals.map(([pid, byUnit]) => (
            <span key={pid} className="rounded-full bg-sun-50 px-3 py-1.5 text-sm font-semibold text-sun-600 ring-1 ring-sun-100">
              {PLANTS_BY_ID[pid]?.emoji} {PLANTS_BY_ID[pid]?.name}:{" "}
              {[...byUnit.entries()].map(([u, n]) => `${Math.round(n * 10) / 10} ${unitLabel(u)}`).join(" + ")}
            </span>
          ))}
        </div>
      )}

      {entries.length > 0 && (
        <ul className="mt-4 space-y-2">
          {entries.map((e) => (
            <li key={e.id} className="flex items-start gap-3 rounded-2xl border border-line bg-paper px-4 py-3">
              <span className="text-xl" aria-hidden>
                {e.kind === "harvest" ? (e.plantId ? PLANTS_BY_ID[e.plantId]?.emoji : "🧺") : "📝"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {e.kind === "harvest"
                    ? `${e.amount != null ? `${e.amount} ${unitLabel(e.unit)} ` : ""}${e.plantId ? PLANTS_BY_ID[e.plantId]?.name.toLowerCase() : "harvest"}`
                    : "Note"}
                </p>
                {e.note && <p className="text-sm text-muted">{e.note}</p>}
                <p className="text-xs text-faint">{fmtDay(e.date)}</p>
              </div>
              <button type="button" onClick={() => remove(e.id)} className="rounded-full p-1.5 text-faint hover:bg-clay-50 hover:text-clay-700" aria-label="Delete entry">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Ask Plantr
// ---------------------------------------------------------------------------

const SUGGESTIONS = ["Why are my tomato leaves turning yellow?", "Is it too late to plant lettuce?", "How often should I water this week?"];

function AskPlantr({ gardenId, today }: { gardenId: string; today: string }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{ q: string; a: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(q: string) {
    if (q.trim().length < 3) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/gardens/${gardenId}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q, today }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { answer?: string; error?: string } | null;
    if (res?.ok && data?.answer) {
      setAnswer({ q, a: data.answer });
      setQuestion("");
    } else setError(data?.error ?? "Plantr couldn't answer right now.");
    setBusy(false);
  }

  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
        <MessageCircle className="h-5 w-5 text-leaf-600" /> Ask Plantr
      </h2>
      <p className="mt-1 text-sm text-muted">Questions about your plants, pests or timing. Answers know your zone and your garden.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value.slice(0, 800))}
          placeholder="Ask anything…"
          className="h-11 min-w-0 flex-1 rounded-full border border-line-strong bg-paper px-4 text-[15px]"
          aria-label="Your question"
        />
        <button type="submit" disabled={busy || question.trim().length < 3} className={buttonClass("primary", "md", "w-11 px-0")} aria-label="Ask">
          {busy ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
      {!answer && !busy && (
        <div className="mt-3 flex flex-col gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" onClick={() => void ask(s)} className="text-left text-sm text-leaf-700 hover:underline">
              {s}
            </button>
          ))}
        </div>
      )}
      {error && <p className="mt-3 text-sm text-clay-700">{error}</p>}
      {answer && (
        <div className="mt-4 rounded-2xl bg-leaf-50 p-4 animate-rise">
          <p className="text-xs font-semibold text-leaf-700">{answer.q}</p>
          <p className="mt-2 flex gap-2 whitespace-pre-line text-[15px] leading-relaxed">
            <Sparkles className="mt-1 h-4 w-4 shrink-0 text-leaf-600" />
            <span>{answer.a}</span>
          </p>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Manage
// ---------------------------------------------------------------------------

function ManageGarden({ gardenId, archived }: { gardenId: string; archived: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function setArchived(value: boolean) {
    setBusy(true);
    await fetch(`/api/gardens/${gardenId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: value ? "archived" : "active" }),
    }).catch(() => null);
    setBusy(false);
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    const res = await fetch(`/api/gardens/${gardenId}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) {
      router.push("/garden");
      router.refresh();
    } else setBusy(false);
  }

  return (
    <div className="rounded-2xl border border-line px-4 py-3 text-sm">
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <button type="button" disabled={busy} onClick={() => setArchived(!archived)} className="inline-flex items-center gap-1.5 font-semibold text-muted hover:text-ink">
          <Archive className="h-4 w-4" /> {archived ? "Restore garden" : "Archive garden"}
        </button>
        {!confirming ? (
          <button type="button" onClick={() => setConfirming(true)} className="inline-flex items-center gap-1.5 font-semibold text-muted hover:text-clay-700">
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        ) : (
          <span className="inline-flex items-center gap-2">
            <span className="text-clay-700">Delete for good?</span>
            <button type="button" disabled={busy} onClick={remove} className="font-semibold text-clay-700 underline">
              Yes, delete
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="font-semibold text-muted">
              Cancel
            </button>
          </span>
        )}
      </div>
      {archived && <p className="mt-2 text-xs text-faint">Archived gardens don&apos;t appear in weekly emails.</p>}
    </div>
  );
}
