"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CircleCheck,
  ImagePlus,
  MapPin,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import type {
  Climate,
  Experience,
  Goal,
  PhotoAnalysis,
  PlanSeason,
  SpaceType,
  SunExposure,
  TimeBudget,
} from "@/lib/garden/types";
import { GOALS, PLANTS } from "@/lib/garden/plants";
import { fmtMMDD, todayISO } from "@/lib/garden/dates";
import type { SeasonOption } from "@/lib/garden/schedule";
import { Button, Card, Spinner, cx } from "@/components/ui";
import { prepareImage } from "./image";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface BedDraft {
  widthFt: number;
  lengthFt: number;
  raised: boolean;
}

interface ClimateInfo {
  climate: Climate;
  stateName: string | null;
  seasonDays: number;
  seasons: SeasonOption[];
}

type AnalysisStatus = "idle" | "loading" | "done" | "error" | "unavailable";

interface WizardState {
  step: number;
  thumb: string | null;
  analysis: PhotoAnalysis | null;
  analysisStatus: AnalysisStatus;
  zip: string;
  climateInfo: ClimateInfo | null;
  frost: { lastFrost: string; firstFrost: string } | null;
  goals: Goal[];
  wants: string[];
  notes: string;
  spaceType: SpaceType;
  beds: BedDraft[];
  containerCount: number;
  containerGallons: number;
  bedsReady: boolean;
  sun: SunExposure;
  spaceTouched: boolean;
  household: number;
  experience: Experience;
  time: TimeBudget;
  seasonKey: string | null;
}

const INITIAL: WizardState = {
  step: 0,
  thumb: null,
  analysis: null,
  analysisStatus: "idle",
  zip: "",
  climateInfo: null,
  frost: null,
  goals: [],
  wants: [],
  notes: "",
  spaceType: "raised-bed",
  beds: [{ widthFt: 4, lengthFt: 8, raised: true }],
  containerCount: 4,
  containerGallons: 5,
  bedsReady: false,
  sun: "full",
  spaceTouched: false,
  household: 2,
  experience: "new",
  time: "moderate",
  seasonKey: null,
};

const STORAGE_KEY = "plantr:wizard:v1";
const STEPS = ["Photo", "Location", "What to grow", "Your space", "About you"];

function loadSaved(): Partial<WizardState> | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<WizardState>) : null;
  } catch {
    return null;
  }
}

/** Fold a photo analysis into the space answers (unless the user already edited them). */
function applyAnalysis(s: WizardState, a: PhotoAnalysis): WizardState {
  if (s.spaceTouched || !a.isGardenSpace) return s;
  const w = Math.max(1, Math.min(40, Math.round(Math.min(a.widthFt, a.lengthFt))));
  const l = Math.max(1, Math.min(40, Math.round(Math.max(a.widthFt, a.lengthFt))));
  const count = Math.max(1, Math.min(6, a.bedCount || 1));
  const raised = a.spaceType === "raised-bed" || a.spaceType === "mixed";
  return {
    ...s,
    spaceType: a.spaceType,
    beds: a.spaceType === "containers" ? s.beds : Array.from({ length: count }, () => ({ widthFt: w, lengthFt: l, raised })),
    containerCount: a.containerCount > 0 ? Math.min(30, a.containerCount) : s.containerCount,
    bedsReady: a.spaceType === "raised-bed",
    sun: a.sun,
  };
}

// ---------------------------------------------------------------------------
// Wizard
// ---------------------------------------------------------------------------

export function Wizard({ aiEnabled, initialGoals }: { aiEnabled: boolean; initialGoals: Goal[] }) {
  const router = useRouter();
  const [s, setS] = useState<WizardState>(INITIAL);
  const [hydrated, setHydrated] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const update = useCallback((patch: Partial<WizardState>) => setS((prev) => ({ ...prev, ...patch })), []);

  // Restore progress after a refresh; apply ?goal= presets from the landing page.
  useEffect(() => {
    const saved = loadSaved();
    queueMicrotask(() => {
      setS((prev) => {
        const next = saved ? { ...prev, ...saved } : prev;
        if (next.analysisStatus === "loading") next.analysisStatus = next.analysis ? "done" : "error";
        if (initialGoals.length && !saved) next.goals = initialGoals;
        return next;
      });
      setHydrated(true);
    });
  }, [initialGoals]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
      // Storage full or blocked: progress just won't survive a refresh.
    }
  }, [s, hydrated]);

  const go = (step: number) => {
    update({ step });
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // ---- Photo analysis runs in the background while the user keeps going ----
  const analyze = useCallback(
    async (image: string) => {
      if (!aiEnabled) {
        update({ analysisStatus: "unavailable" });
        return;
      }
      update({ analysisStatus: "loading", analysis: null });
      try {
        const res = await fetch("/api/photo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image }),
        });
        const data = (await res.json()) as { analysis?: PhotoAnalysis | null; aiEnabled?: boolean; error?: string };
        if (!res.ok || !data.analysis) {
          setS((prev) => ({ ...prev, analysisStatus: data.aiEnabled === false ? "unavailable" : "error" }));
          return;
        }
        const analysis = data.analysis;
        setS((prev) => applyAnalysis({ ...prev, analysis, analysisStatus: "done" }, analysis));
      } catch {
        update({ analysisStatus: "error" });
      }
    },
    [aiEnabled, update],
  );

  // ---- Submit ----
  async function submit() {
    if (!s.climateInfo) return go(1);
    const option = s.climateInfo.seasons.find((o) => `${o.season}-${o.year}` === s.seasonKey) ?? s.climateInfo.seasons[0];
    if (!option) return;
    setGenerating(true);
    setSubmitError(null);

    const areas = [
      ...(s.spaceType === "containers"
        ? []
        : s.beds.map((b) => ({
            kind: "bed" as const,
            widthFt: b.widthFt,
            lengthFt: b.lengthFt,
            raised: s.spaceType === "raised-bed" ? true : s.spaceType === "in-ground" ? false : b.raised,
          }))),
      ...(s.spaceType === "containers" || s.spaceType === "mixed"
        ? [{ kind: "containers" as const, count: s.containerCount, gallons: s.containerGallons }]
        : []),
    ];

    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zip: s.zip,
          frost: s.frost,
          spaceType: s.spaceType,
          areas,
          bedsReady: s.bedsReady,
          sun: s.sun,
          goals: s.goals,
          wants: s.wants,
          notes: s.notes,
          household: s.household,
          experience: s.experience,
          time: s.time,
          season: option.season as PlanSeason,
          year: option.year,
          photo: s.analysis,
          photoThumb: s.thumb,
          today: todayISO(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error || "Something went wrong creating your plan.");
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {}
      router.push(`/plan/${data.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong creating your plan.");
      setGenerating(false);
    }
  }

  if (generating || submitError) {
    return (
      <Generating
        zip={s.zip}
        zone={s.climateInfo?.climate.zone ?? ""}
        error={submitError}
        onRetry={submit}
        onBack={() => {
          setSubmitError(null);
          setGenerating(false);
        }}
      />
    );
  }

  return (
    <div ref={topRef} className="mx-auto max-w-2xl scroll-mt-20 px-4 pb-32 pt-6 sm:pt-10">
      <Progress step={s.step} onJump={(i) => i < s.step && go(i)} />
      <div key={s.step} className="mt-6 animate-rise">
        {s.step === 0 && <PhotoStep s={s} update={update} analyze={analyze} aiEnabled={aiEnabled} next={() => go(1)} />}
        {s.step === 1 && <LocationStep s={s} update={update} />}
        {s.step === 2 && <GrowStep s={s} update={update} />}
        {s.step === 3 && <SpaceStep s={s} update={update} />}
        {s.step === 4 && <AboutStep s={s} update={update} />}
      </div>

      {s.step > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 backdrop-blur-md pb-safe">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 pt-3">
            <Button variant="ghost" onClick={() => go(s.step - 1)}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            {s.step < 4 ? (
              <Button onClick={() => go(s.step + 1)} disabled={s.step === 1 && !s.climateInfo}>
                {s.step === 2 && s.goals.length === 0 && s.wants.length === 0 && !s.notes.trim() ? "Skip, surprise me" : "Continue"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button size="lg" onClick={submit} disabled={!s.climateInfo || !spaceValid(s)}>
                <Sparkles className="h-5 w-5" />
                Create my plan
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function spaceValid(s: WizardState): boolean {
  if (s.spaceType === "containers") return s.containerCount > 0;
  return s.beds.length > 0 && s.beds.every((b) => b.widthFt >= 1 && b.lengthFt >= 1);
}

function Progress({ step, onJump }: { step: number; onJump: (i: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-semibold text-muted">
        <span>
          Step {step + 1} of {STEPS.length}
        </span>
        <span>{STEPS[step]}</span>
      </div>
      <div className="mt-2 flex gap-1.5" role="list" aria-label="Progress">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            role="listitem"
            aria-label={`${label}${i < step ? " (done)" : ""}`}
            onClick={() => onJump(i)}
            className={cx("h-1.5 flex-1 rounded-full transition-colors", i <= step ? "bg-leaf-500" : "bg-line")}
          />
        ))}
      </div>
    </div>
  );
}

function StepHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-[32px] font-semibold leading-tight sm:text-4xl">{title}</h1>
      {children && <p className="mt-2 text-[17px] leading-relaxed text-muted">{children}</p>}
    </div>
  );
}

type StepProps = { s: WizardState; update: (patch: Partial<WizardState>) => void };

// ---------------------------------------------------------------------------
// Step 1: photo
// ---------------------------------------------------------------------------

function PhotoStep({
  s,
  update,
  analyze,
  aiEnabled,
  next,
}: StepProps & { analyze: (image: string) => void; aiEnabled: boolean; next: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setErr(null);
    setBusy(true);
    try {
      const { full, thumb } = await prepareImage(file);
      update({ thumb, analysis: null, spaceTouched: false });
      void analyze(full);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "We couldn't read that photo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <StepHeader title="Show us your space">
        Snap a photo of the yard, bed, patio or balcony you want to plant.{" "}
        {aiEnabled ? "We'll estimate its size and how much sun it gets." : "It'll appear on your plan."}
      </StepHeader>

      {s.thumb ? (
        <Card className="overflow-hidden">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
            <img src={s.thumb} alt="Your garden space" className="aspect-[4/3] w-full object-cover" />
            <div className="absolute left-3 top-3">
              {s.analysisStatus === "loading" && (
                <span className="inline-flex items-center gap-2 rounded-full bg-ink/80 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur">
                  <Spinner className="h-4 w-4" /> Analyzing your space…
                </span>
              )}
              {s.analysisStatus === "done" && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-leaf-600/90 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur">
                  <CircleCheck className="h-4 w-4" /> Space analyzed
                </span>
              )}
            </div>
          </div>
          <div className="space-y-3 p-4 sm:p-5">
            {s.analysisStatus === "loading" && (
              <p className="text-[15px] text-muted">This takes a few seconds. Keep going; we&apos;ll fill in your space details when it&apos;s ready.</p>
            )}
            {s.analysisStatus === "done" && s.analysis && <AnalysisSummary a={s.analysis} />}
            {s.analysisStatus === "error" && (
              <p className="text-[15px] text-muted">We couldn&apos;t analyze this one, no problem. You&apos;ll confirm your space in a couple of steps.</p>
            )}
            {s.analysisStatus === "unavailable" && (
              <p className="text-[15px] text-muted">Photo added. You&apos;ll enter the size and sunlight in a couple of steps.</p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button onClick={next}>
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
              <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border border-line-strong px-5 text-[15px] font-semibold hover:bg-leaf-50">
                <RefreshCw className="h-4 w-4" /> Retake
                <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
              </label>
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          <label className="group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border-2 border-dashed border-leaf-300 bg-leaf-50/60 px-6 py-12 text-center transition-colors hover:border-leaf-500 hover:bg-leaf-50">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-leaf-600 text-white shadow-lg transition-transform group-hover:scale-105">
              {busy ? <Spinner className="h-7 w-7" /> : <Camera className="h-7 w-7" />}
            </span>
            <span className="font-display text-xl font-semibold">Take a photo</span>
            <span className="text-sm text-muted">Stand back so the whole area is in the frame</span>
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} disabled={busy} />
          </label>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-full border border-line-strong bg-paper px-5 py-3 font-semibold transition-colors hover:bg-leaf-50">
            <ImagePlus className="h-5 w-5 text-leaf-600" />
            Choose from your photos
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} disabled={busy} />
          </label>
          {err && <p className="rounded-xl bg-clay-50 px-4 py-3 text-sm text-clay-700">{err}</p>}
          <ul className="grid gap-2 pt-2 text-sm text-muted sm:grid-cols-3">
            {["Daylight works best", "Include a fence, door or bed for scale", "Your photo stays private"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <Check className="h-4 w-4 text-leaf-500" />
                {t}
              </li>
            ))}
          </ul>
          <div className="pt-4 text-center">
            <button type="button" onClick={next} className="text-[15px] font-semibold text-leaf-700 underline-offset-4 hover:underline">
              No photo? Describe your space instead
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AnalysisSummary({ a }: { a: PhotoAnalysis }) {
  if (!a.isGardenSpace) {
    return <p className="text-[15px] text-muted">{a.summary} You can describe your space in a couple of steps.</p>;
  }
  const type = { "in-ground": "In-ground space", "raised-bed": "Raised beds", containers: "Container space", mixed: "Beds + containers" }[a.spaceType];
  const sun = { full: "full sun", partial: "partial sun", shade: "mostly shade" }[a.sun];
  return (
    <div>
      <p className="text-[15px] leading-relaxed">{a.summary}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="rounded-full bg-leaf-50 px-3 py-1 text-sm font-semibold text-leaf-700">{type}</span>
        {a.spaceType !== "containers" && (
          <span className="rounded-full bg-leaf-50 px-3 py-1 text-sm font-semibold text-leaf-700">
            ~{a.widthFt} × {a.lengthFt} ft{a.bedCount > 1 ? ` × ${a.bedCount}` : ""}
          </span>
        )}
        <span className="rounded-full bg-sun-50 px-3 py-1 text-sm font-semibold text-sun-600">Looks like {sun}</span>
      </div>
      {a.observations.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-sm text-muted">
          {a.observations.map((o) => (
            <li key={o} className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-leaf-500" />
              {o}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: location
// ---------------------------------------------------------------------------

function LocationStep({ s, update }: StepProps) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editFrost, setEditFrost] = useState(Boolean(s.frost));
  const lastFetched = useRef<string | null>(s.climateInfo?.climate.zip ?? null);

  const lookup = useCallback(
    async (zip: string) => {
      if (!/^\d{5}$/.test(zip) || lastFetched.current === zip) return;
      lastFetched.current = zip;
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`/api/climate?zip=${zip}&today=${todayISO()}`);
        const data = (await res.json()) as ClimateInfo & { error?: string };
        if (!res.ok) throw new Error(data.error || "We couldn't look up that ZIP code.");
        update({ climateInfo: data, frost: null, seasonKey: data.seasons[0] ? `${data.seasons[0].season}-${data.seasons[0].year}` : null });
      } catch (e) {
        lastFetched.current = null;
        update({ climateInfo: null });
        setErr(e instanceof Error ? e.message : "We couldn't look up that ZIP code.");
      } finally {
        setLoading(false);
      }
    },
    [update],
  );

  const info = s.climateInfo;
  const c = info?.climate;
  const last = s.frost?.lastFrost ?? c?.lastFrost;
  const first = s.frost?.firstFrost ?? c?.firstFrost;

  return (
    <div>
      <StepHeader title="Where's your garden?">Your ZIP code tells us your growing zone and frost dates, so every date in your plan fits your climate.</StepHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void lookup(s.zip);
        }}
        className="flex gap-2"
      >
        <label className="relative flex-1">
          <span className="sr-only">ZIP code</span>
          <MapPin className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-faint" />
          <input
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={5}
            placeholder="ZIP code"
            value={s.zip}
            onChange={(e) => {
              const zip = e.target.value.replace(/\D/g, "").slice(0, 5);
              update({ zip });
              if (zip.length === 5) void lookup(zip);
            }}
            className="h-14 w-full rounded-2xl border border-line-strong bg-paper pl-12 pr-4 text-xl font-semibold tracking-widest placeholder:font-normal placeholder:tracking-normal placeholder:text-faint focus:border-leaf-500 focus:outline-none"
          />
        </label>
        <Button type="submit" size="lg" variant="secondary" disabled={s.zip.length !== 5 || loading}>
          {loading ? <Spinner /> : "Look up"}
        </Button>
      </form>
      {err && <p className="mt-3 rounded-xl bg-clay-50 px-4 py-3 text-sm text-clay-700">{err}</p>}

      {info && c && (
        <Card className="mt-5 overflow-hidden animate-rise">
          <div className="flex items-center justify-between bg-gradient-to-br from-leaf-600 to-leaf-800 p-5 text-white">
            <div>
              <p className="text-sm text-leaf-100">{info.stateName ?? `ZIP ${c.zip}`}</p>
              <p className="font-display text-4xl font-semibold">Zone {c.zone}</p>
            </div>
            <span className="text-5xl" aria-hidden>
              {c.frostFree ? "🌴" : Number.parseInt(c.zone) <= 5 ? "❄️" : "🌤️"}
            </span>
          </div>
          <div className="grid grid-cols-3 divide-x divide-line text-center">
            <div className="p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">Last frost</p>
              <p className="font-display text-lg font-semibold">{c.frostFree ? "None" : `~${fmtMMDD(last!)}`}</p>
            </div>
            <div className="p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">First frost</p>
              <p className="font-display text-lg font-semibold">{c.frostFree ? "None" : `~${fmtMMDD(first!)}`}</p>
            </div>
            <div className="p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">Season</p>
              <p className="font-display text-lg font-semibold">{c.frostFree ? "Year-round" : `${info.seasonDays} days`}</p>
            </div>
          </div>
          <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-faint">
            {c.source === "noaa" && c.station
              ? `From NOAA climate normals for ${c.station.name}${c.station.distanceMi > 1 ? `, ${c.station.distanceMi} mi away` : ""}.`
              : "Typical dates for your hardiness zone."}
          </p>
          {!c.frostFree && (
            <div className="border-t border-line px-5 py-3">
              {editFrost ? (
                <FrostEditor
                  lastFrost={last!}
                  firstFrost={first!}
                  onChange={(frost) => update({ frost })}
                  onReset={() => {
                    update({ frost: null });
                    setEditFrost(false);
                  }}
                />
              ) : (
                <button type="button" onClick={() => setEditFrost(true)} className="text-sm font-semibold text-leaf-700 hover:underline">
                  Know your exact frost dates? Adjust them
                </button>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function FrostEditor({
  lastFrost,
  firstFrost,
  onChange,
  onReset,
}: {
  lastFrost: string;
  firstFrost: string;
  onChange: (f: { lastFrost: string; firstFrost: string }) => void;
  onReset: () => void;
}) {
  const year = new Date().getFullYear();
  const toMMDD = (v: string) => v.slice(5);
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="text-sm">
        <span className="font-semibold">Last spring frost</span>
        <input
          type="date"
          value={`${year}-${lastFrost}`}
          onChange={(e) => e.target.value && onChange({ lastFrost: toMMDD(e.target.value), firstFrost })}
          className="mt-1 h-11 w-full rounded-xl border border-line-strong bg-paper px-3"
        />
      </label>
      <label className="text-sm">
        <span className="font-semibold">First fall frost</span>
        <input
          type="date"
          value={`${year}-${firstFrost}`}
          onChange={(e) => e.target.value && onChange({ lastFrost, firstFrost: toMMDD(e.target.value) })}
          className="mt-1 h-11 w-full rounded-xl border border-line-strong bg-paper px-3"
        />
      </label>
      <button type="button" onClick={onReset} className="col-span-2 justify-self-start text-sm font-semibold text-muted hover:underline">
        Use the typical dates for my zone
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: what to grow
// ---------------------------------------------------------------------------

const POPULAR = [
  "cherry-tomato",
  "tomato",
  "bell-pepper",
  "hot-pepper",
  "cucumber",
  "zucchini",
  "lettuce",
  "basil",
  "strawberry",
  "bush-beans",
  "carrot",
  "kale",
];
const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "vegetable", label: "Vegetables" },
  { id: "herb", label: "Herbs" },
  { id: "flower", label: "Flowers" },
  { id: "fruit", label: "Fruit" },
] as const;

function GrowStep({ s, update }: StepProps) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]["id"]>("all");
  const [showAll, setShowAll] = useState(s.wants.some((w) => !POPULAR.includes(w)));

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const plants = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = PLANTS.filter((p) => (cat === "all" || p.category === cat) && (!q || p.name.toLowerCase().includes(q)));
    if (!showAll && !q && cat === "all") list = POPULAR.map((id) => PLANTS.find((p) => p.id === id)!).filter(Boolean);
    return list;
  }, [query, cat, showAll]);

  return (
    <div>
      <StepHeader title="What do you want to grow?">Pick any goals that sound good. We&apos;ll choose plants that fit them, your climate and your space.</StepHeader>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {GOALS.map((g) => {
          const on = s.goals.includes(g.id);
          return (
            <button
              key={g.id}
              type="button"
              aria-pressed={on}
              onClick={() => update({ goals: toggle(s.goals, g.id) })}
              className={cx(
                "relative flex flex-col items-start rounded-2xl border p-3.5 text-left transition-all",
                on ? "border-leaf-500 bg-leaf-50 ring-2 ring-leaf-500/30" : "border-line bg-paper hover:border-leaf-300",
              )}
            >
              <span className="text-2xl" aria-hidden>
                {g.emoji}
              </span>
              <span className="mt-1.5 text-[15px] font-semibold leading-tight">{g.label}</span>
              <span className="mt-0.5 text-xs leading-snug text-muted">{g.blurb}</span>
              {on && <CircleCheck className="absolute right-2.5 top-2.5 h-5 w-5 text-leaf-600" />}
            </button>
          );
        })}
      </div>

      <h2 className="mt-8 font-display text-xl font-semibold">Anything specific?</h2>
      <p className="text-sm text-muted">Optional. Tap plants you definitely want{s.wants.length ? ` (${s.wants.length} picked)` : ""}.</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Search plants</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tomatoes, basil…"
            className="h-11 w-full rounded-full border border-line-strong bg-paper pl-10 pr-4 focus:border-leaf-500 focus:outline-none"
          />
        </label>
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setCat(c.id);
                if (c.id !== "all") setShowAll(true);
              }}
              className={cx(
                "h-11 shrink-0 rounded-full px-4 text-sm font-semibold",
                cat === c.id ? "bg-ink text-white" : "border border-line bg-paper text-muted",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {plants.map((p) => {
          const on = s.wants.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              onClick={() => update({ wants: toggle(s.wants, p.id) })}
              className={cx(
                "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors",
                on ? "border-leaf-600 bg-leaf-600 text-white" : "border-line bg-paper hover:border-leaf-300",
              )}
            >
              <span aria-hidden>{p.emoji}</span>
              {p.name}
              {on && <Check className="h-3.5 w-3.5" />}
            </button>
          );
        })}
        {plants.length === 0 && <p className="text-sm text-muted">No matches. Mention it in the notes below and we&apos;ll take a look.</p>}
      </div>
      {!showAll && !query && cat === "all" && (
        <button type="button" onClick={() => setShowAll(true)} className="mt-3 text-sm font-semibold text-leaf-700 hover:underline">
          Show all {PLANTS.length} plants
        </button>
      )}

      <label className="mt-8 block">
        <span className="font-display text-xl font-semibold">Anything else we should know?</span>
        <textarea
          value={s.notes}
          onChange={(e) => update({ notes: e.target.value.slice(0, 1000) })}
          rows={3}
          placeholder="e.g. We love spicy food, the kids want pumpkins, deer visit the yard…"
          className="mt-2 w-full rounded-2xl border border-line-strong bg-paper p-4 text-[15px] focus:border-leaf-500 focus:outline-none"
        />
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4: space
// ---------------------------------------------------------------------------

const SPACE_TYPES: { id: SpaceType; label: string; emoji: string; blurb: string }[] = [
  { id: "raised-bed", label: "Raised beds", emoji: "🪴", blurb: "Framed beds filled with soil" },
  { id: "in-ground", label: "In the ground", emoji: "🌱", blurb: "Lawn or soil I can dig" },
  { id: "containers", label: "Containers", emoji: "🏺", blurb: "Pots on a patio or balcony" },
  { id: "mixed", label: "A mix", emoji: "🧺", blurb: "Some beds plus some pots" },
];

function SpaceStep({ s, update }: StepProps) {
  const set = (patch: Partial<WizardState>) => update({ ...patch, spaceTouched: true });
  const bedSqFt = s.spaceType === "containers" ? 0 : s.beds.reduce((n, b) => n + b.widthFt * b.lengthFt, 0);
  const showBeds = s.spaceType !== "containers";
  const showPots = s.spaceType === "containers" || s.spaceType === "mixed";

  return (
    <div>
      <StepHeader title="Tell us about your space">Rough numbers are fine. We&apos;ll fit the plan to whatever you have.</StepHeader>

      {s.analysis?.isGardenSpace && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-leaf-200 bg-leaf-50 p-3.5">
          {s.thumb && (
            // eslint-disable-next-line @next/next/no-img-element -- local data URL preview
            <img src={s.thumb} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
          )}
          <div className="text-sm">
            <p className="flex items-center gap-1.5 font-semibold text-leaf-700">
              <Sparkles className="h-4 w-4" /> Pre-filled from your photo
            </p>
            <p className="text-muted">
              {s.analysis.confidence === "high" ? "We're fairly confident" : "These are estimates"}. Double-check the size and sun below.
            </p>
            {s.analysis.concerns.length > 0 && (
              <p className="mt-1 flex gap-1.5 text-sun-600">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                {s.analysis.concerns[0]}
              </p>
            )}
          </div>
        </div>
      )}

      <Section title="What kind of space?">
        <div className="grid grid-cols-2 gap-2.5">
          {SPACE_TYPES.map((t) => (
            <OptionCard
              key={t.id}
              on={s.spaceType === t.id}
              onClick={() => set({ spaceType: t.id, bedsReady: t.id === "raised-bed" ? s.bedsReady : false })}
              emoji={t.emoji}
              title={t.label}
              blurb={t.blurb}
            />
          ))}
        </div>
      </Section>

      {showBeds && (
        <Section title={s.spaceType === "in-ground" ? "Planting area" : "Your beds"} hint={`About ${bedSqFt} sq ft of growing space`}>
          <div className="space-y-2.5">
            {s.beds.map((b, i) => (
              <div key={i} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-paper p-3">
                <span className="w-14 text-sm font-semibold text-muted">{s.spaceType === "in-ground" ? `Plot ${i + 1}` : `Bed ${i + 1}`}</span>
                <NumberField
                  label="Width"
                  value={b.widthFt}
                  onChange={(v) => set({ beds: s.beds.map((x, j) => (j === i ? { ...x, widthFt: v } : x)) })}
                />
                <span className="text-faint">×</span>
                <NumberField
                  label="Length"
                  value={b.lengthFt}
                  onChange={(v) => set({ beds: s.beds.map((x, j) => (j === i ? { ...x, lengthFt: v } : x)) })}
                />
                <span className="text-sm text-muted">ft</span>
                {s.spaceType === "mixed" && (
                  <label className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={b.raised}
                      onChange={(e) => set({ beds: s.beds.map((x, j) => (j === i ? { ...x, raised: e.target.checked } : x)) })}
                      className="h-4 w-4 accent-leaf-600"
                    />
                    Raised
                  </label>
                )}
                {s.beds.length > 1 && (
                  <button
                    type="button"
                    onClick={() => set({ beds: s.beds.filter((_, j) => j !== i) })}
                    className="ml-auto rounded-full p-2 text-faint hover:bg-clay-50 hover:text-clay-700"
                    aria-label={`Remove bed ${i + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            {s.beds.length < 6 && (
              <button
                type="button"
                onClick={() => set({ beds: [...s.beds, { ...(s.beds.at(-1) ?? { widthFt: 4, lengthFt: 8, raised: true }) }] })}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-leaf-700 hover:underline"
              >
                <Plus className="h-4 w-4" /> Add another {s.spaceType === "in-ground" ? "plot" : "bed"}
              </button>
            )}
          </div>
          {s.spaceType === "in-ground" && s.beds.some((b) => Math.min(b.widthFt, b.lengthFt) > 4) && (
            <p className="mt-2 text-sm text-muted">We&apos;ll add paths so you can reach every plant without stepping on the soil.</p>
          )}
        </Section>
      )}

      {showPots && (
        <Section title="Containers" hint="A 5-gallon pot is about the size of a hardware-store bucket.">
          <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-paper p-3">
            <Stepper label="How many" value={s.containerCount} min={1} max={30} onChange={(v) => set({ containerCount: v })} />
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">Size each</p>
              <div className="flex flex-wrap gap-1.5">
                {[1, 2, 3, 5, 7, 10, 15, 20].map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => set({ containerGallons: g })}
                    className={cx(
                      "h-9 rounded-full px-3 text-sm font-semibold",
                      s.containerGallons === g ? "bg-leaf-600 text-white" : "border border-line bg-paper text-muted",
                    )}
                  >
                    {g} gal
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Section>
      )}

      <Section title="Is it ready to plant?">
        <div className="grid grid-cols-2 gap-2.5">
          <OptionCard
            on={s.bedsReady}
            onClick={() => set({ bedsReady: true })}
            emoji="✅"
            title={s.spaceType === "containers" ? "I have pots & soil" : s.spaceType === "in-ground" ? "Soil is ready" : "Built & filled"}
            blurb="Just needs plants"
          />
          <OptionCard
            on={!s.bedsReady}
            onClick={() => set({ bedsReady: false })}
            emoji="🛠️"
            title={s.spaceType === "containers" ? "Need pots & soil" : s.spaceType === "in-ground" ? "It's lawn or weeds" : "Need to build them"}
            blurb="Add supplies to my list"
          />
        </div>
      </Section>

      <Section title="How much sun does it get?" hint="Not sure? Check the spot at 9 am, noon and 3 pm and count the hours of direct sun.">
        <div className="grid grid-cols-3 gap-2.5">
          {(
            [
              { id: "full", emoji: "☀️", title: "Full sun", blurb: "6+ hours" },
              { id: "partial", emoji: "⛅", title: "Part sun", blurb: "4–6 hours" },
              { id: "shade", emoji: "☁️", title: "Mostly shade", blurb: "Under 4 hours" },
            ] as const
          ).map((o) => (
            <OptionCard key={o.id} on={s.sun === o.id} onClick={() => set({ sun: o.id })} emoji={o.emoji} title={o.title} blurb={o.blurb} />
          ))}
        </div>
        {s.analysis?.isGardenSpace && s.analysis.sunReason && !s.spaceTouched && (
          <p className="mt-2 text-sm text-muted">From your photo: {s.analysis.sunReason}</p>
        )}
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 5: about you
// ---------------------------------------------------------------------------

function AboutStep({ s, update }: StepProps) {
  const seasons = s.climateInfo?.seasons ?? [];
  const selected = s.seasonKey ?? (seasons[0] ? `${seasons[0].season}-${seasons[0].year}` : null);
  return (
    <div>
      <StepHeader title="Almost there">A few quick questions so the plan fits your life, not just your yard.</StepHeader>

      <Section title="How many people are you growing for?">
        <Stepper label="People" value={s.household} min={1} max={12} onChange={(v) => update({ household: v })} />
      </Section>

      <Section title="Your gardening experience">
        <div className="grid grid-cols-3 gap-2.5">
          {(
            [
              { id: "new", emoji: "🌱", title: "First garden", blurb: "Keep it simple" },
              { id: "some", emoji: "🌿", title: "A little", blurb: "Grown a few things" },
              { id: "experienced", emoji: "🌳", title: "Experienced", blurb: "Bring it on" },
            ] as const
          ).map((o) => (
            <OptionCard key={o.id} on={s.experience === o.id} onClick={() => update({ experience: o.id })} emoji={o.emoji} title={o.title} blurb={o.blurb} />
          ))}
        </div>
      </Section>

      <Section title="Time you can spend each week">
        <div className="grid grid-cols-3 gap-2.5">
          {(
            [
              { id: "minimal", emoji: "⏱️", title: "Under 1 hr", blurb: "Low-maintenance" },
              { id: "moderate", emoji: "🕐", title: "1–3 hrs", blurb: "A weekend hour" },
              { id: "plenty", emoji: "🧑‍🌾", title: "3+ hrs", blurb: "I love it out there" },
            ] as const
          ).map((o) => (
            <OptionCard key={o.id} on={s.time === o.id} onClick={() => update({ time: o.id })} emoji={o.emoji} title={o.title} blurb={o.blurb} />
          ))}
        </div>
      </Section>

      {seasons.length > 0 && (
        <Section title="When do you want to plant?">
          <div className="space-y-2.5">
            {seasons.map((o) => {
              const key = `${o.season}-${o.year}`;
              const on = selected === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => update({ seasonKey: key })}
                  className={cx(
                    "flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-all",
                    on ? "border-leaf-500 bg-leaf-50 ring-2 ring-leaf-500/30" : "border-line bg-paper hover:border-leaf-300",
                  )}
                >
                  <span className="text-2xl" aria-hidden>
                    {o.season === "fall" ? "🍂" : "🌷"}
                  </span>
                  <span className="flex-1">
                    <span className="block font-semibold">{o.label}</span>
                    <span className="block text-sm text-muted">{o.description}</span>
                  </span>
                  {on && <CircleCheck className="h-5 w-5 text-leaf-600" />}
                </button>
              );
            })}
          </div>
        </Section>
      )}
      {!s.climateInfo && <p className="rounded-xl bg-clay-50 px-4 py-3 text-sm text-clay-700">Add your ZIP code first so we can time everything.</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bits
// ---------------------------------------------------------------------------

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mt-7 first:mt-0">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      {hint && <p className="mb-3 mt-0.5 text-sm text-muted">{hint}</p>}
      <div className={hint ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

function OptionCard({
  on,
  onClick,
  emoji,
  title,
  blurb,
}: {
  on: boolean;
  onClick: () => void;
  emoji: string;
  title: string;
  blurb: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx(
        "relative flex flex-col items-start rounded-2xl border p-3.5 text-left transition-all",
        on ? "border-leaf-500 bg-leaf-50 ring-2 ring-leaf-500/30" : "border-line bg-paper hover:border-leaf-300",
      )}
    >
      <span className="text-2xl" aria-hidden>
        {emoji}
      </span>
      <span className="mt-1.5 text-[15px] font-semibold leading-tight">{title}</span>
      <span className="mt-0.5 text-xs text-muted">{blurb}</span>
      {on && <CircleCheck className="absolute right-2.5 top-2.5 h-5 w-5 text-leaf-600" />}
    </button>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    queueMicrotask(() => setText((t) => (Number(t) === value ? t : String(value))));
  }, [value]);
  return (
    <label className="flex items-center">
      <span className="sr-only">{label} in feet</span>
      <input
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d.]/g, "").slice(0, 4);
          setText(t);
          const n = Number(t);
          if (n >= 1 && n <= 40) onChange(Math.round(n * 2) / 2);
        }}
        onBlur={() => setText(String(value))}
        className="h-11 w-16 rounded-xl border border-line-strong bg-paper text-center text-lg font-semibold focus:border-leaf-500 focus:outline-none"
        aria-label={`${label} (feet)`}
      />
    </label>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">{label}</p>
      <div className="inline-flex items-center rounded-full border border-line-strong bg-paper">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="flex h-11 w-11 items-center justify-center rounded-full text-leaf-700 disabled:opacity-30"
          aria-label={`Fewer ${label.toLowerCase()}`}
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="w-10 text-center text-lg font-semibold" aria-live="polite">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="flex h-11 w-11 items-center justify-center rounded-full text-leaf-700 disabled:opacity-30"
          aria-label={`More ${label.toLowerCase()}`}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generating screen
// ---------------------------------------------------------------------------

function Generating({
  zip,
  zone,
  error,
  onRetry,
  onBack,
}: {
  zip: string;
  zone: string;
  error: string | null;
  onRetry: () => void;
  onBack: () => void;
}) {
  const messages = useMemo(
    () => [
      `Checking frost dates for ${zip}…`,
      `Finding plants that thrive in zone ${zone}…`,
      "Choosing the right varieties for your space…",
      "Laying out your beds with tall plants to the north…",
      "Timing every planting to your frost dates…",
      "Writing your shopping list…",
      "Adding the finishing touches…",
    ],
    [zip, zone],
  );
  const [i, setI] = useState(0);
  useEffect(() => {
    if (error) return;
    const t = setInterval(() => setI((n) => Math.min(n + 1, messages.length - 1)), 2600);
    return () => clearInterval(t);
  }, [error, messages.length]);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 text-center">
      {error ? (
        <>
          <span className="text-5xl" aria-hidden>
            🥀
          </span>
          <h1 className="mt-4 font-display text-2xl font-semibold">That didn&apos;t work</h1>
          <p className="mt-2 text-muted">{error}</p>
          <div className="mt-6 flex gap-2">
            <Button variant="secondary" onClick={onBack}>
              Edit answers
            </Button>
            <Button onClick={onRetry}>Try again</Button>
          </div>
        </>
      ) : (
        <>
          <svg viewBox="0 0 120 120" className="h-32 w-32" aria-hidden>
            <ellipse cx="60" cy="104" rx="38" ry="8" fill="#7a5a3f" opacity="0.25" />
            <path d="M30 98h60l-6 14H36z" fill="#c8643b" />
            <rect x="26" y="92" width="68" height="9" rx="3" fill="#d9845e" />
            <g className="animate-sway" style={{ transformOrigin: "60px 92px" }}>
              <path d="M60 92V52" stroke="#2f6b3b" strokeWidth="4" strokeLinecap="round" />
              <path d="M60 64c0-14 9-23 25-23 0 14-10 23-25 23z" fill="#468a3d" />
              <path d="M60 74c0-11-7-18-20-18 0 11 8 18 20 18z" fill="#67a75a" />
              <circle cx="60" cy="48" r="6" fill="#f2b33d" />
            </g>
          </svg>
          <h1 className="mt-4 font-display text-2xl font-semibold">Designing your garden</h1>
          <p className="mt-2 min-h-[48px] text-[17px] text-muted" aria-live="polite">
            {messages[i]}
          </p>
          <div className="mt-6 h-1.5 w-56 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-leaf-500 transition-all duration-[2500ms] ease-out"
              style={{ width: `${Math.round(((i + 1) / messages.length) * 92)}%` }}
            />
          </div>
          <p className="mt-6 text-sm text-faint">This usually takes 15–40 seconds.</p>
        </>
      )}
    </div>
  );
}
