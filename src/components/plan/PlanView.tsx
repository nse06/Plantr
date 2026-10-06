"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CalendarDays, Check, ClipboardList, Heart, LayoutGrid, Leaf, Share2, ShoppingBasket, Sprout } from "lucide-react";
import type { GardenPlan, PlanInput } from "@/lib/garden/types";
import { todayISO } from "@/lib/garden/dates";
import { useTaskDone } from "@/components/garden/tasks";
import { Button, Chip, Spinner, buttonClass, cx } from "@/components/ui";
import { CalendarTab, CareTab, LayoutTab, OverviewTab, PlantsTab, ShoppingTab } from "./sections";

const TABS = [
  { id: "overview", label: "Overview", icon: Sprout },
  { id: "layout", label: "Layout", icon: LayoutGrid },
  { id: "plants", label: "Plants", icon: Leaf },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "shopping", label: "Shopping", icon: ShoppingBasket },
  { id: "care", label: "Care", icon: ClipboardList },
] as const;

type TabId = (typeof TABS)[number]["id"];

export interface PlanViewProps {
  garden: { id: string; name: string; status: "draft" | "active" | "archived"; photo: string | null };
  input: PlanInput;
  plan: GardenPlan;
  viewer: { signedIn: boolean; canEdit: boolean; isOwner: boolean };
  doneTaskIds: string[];
  serverToday: string;
}

export function PlanView({ garden, input, plan, viewer, doneTaskIds, serverToday }: PlanViewProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTab] = useState<TabId>("overview");
  const [today, setToday] = useState(serverToday);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [shared, setShared] = useState(false);
  const saved = garden.status !== "draft" && viewer.isOwner;
  const tasks = useTaskDone(garden.id, doneTaskIds, saved);
  const autoSaveTried = useRef(false);

  const selectTab = useCallback((id: string) => {
    if (!TABS.some((t) => t.id === id)) return;
    setTab(id as TabId);
    history.replaceState(null, "", `#${id}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  useEffect(() => {
    // Sync to the visitor's own calendar day and any #tab in the URL after hydration.
    const local = todayISO();
    const fromHash = () => {
      const hash = window.location.hash.slice(1);
      if (TABS.some((t) => t.id === hash)) setTab(hash as TabId);
    };
    queueMicrotask(() => {
      if (local !== serverToday) setToday(local);
      fromHash();
    });
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [serverToday]);

  const save = useCallback(async () => {
    if (!viewer.signedIn) {
      router.push(`/login?next=${encodeURIComponent(`/plan/${garden.id}?save=1`)}&reason=save`);
      return;
    }
    setSaving(true);
    setSaveError(null);
    const res = await fetch(`/api/gardens/${garden.id}/save`, { method: "POST" }).catch(() => null);
    if (res?.ok) {
      router.push(`/garden/${garden.id}?welcome=1`);
      router.refresh();
      return;
    }
    const data = (await res?.json().catch(() => null)) as { error?: string } | null;
    setSaveError(data?.error ?? "Couldn't save your garden. Please try again.");
    setSaving(false);
  }, [viewer.signedIn, garden.id, router]);

  useEffect(() => {
    // Coming back from sign-in with ?save=1: finish what they started.
    if (params.get("save") === "1" && viewer.signedIn && viewer.canEdit && !saved && !autoSaveTried.current) {
      autoSaveTried.current = true;
      queueMicrotask(() => void save());
    }
  }, [params, viewer.signedIn, viewer.canEdit, saved, save]);

  async function share() {
    const url = `${window.location.origin}/plan/${garden.id}`;
    try {
      if (navigator.share) await navigator.share({ title: garden.name, text: "Check out my garden plan from Plantr", url });
      else {
        await navigator.clipboard.writeText(url);
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      }
    } catch {}
  }

  const seasonLabel = plan.season === "fall" ? `Fall ${plan.year}` : `${plan.year} season`;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:pt-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-4">
          {garden.photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- small data-URL thumbnail
            <img src={garden.photo} alt="Your garden space" className="h-16 w-16 shrink-0 rounded-2xl object-cover ring-1 ring-line sm:h-20 sm:w-20" />
          ) : (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-leaf-100 text-3xl sm:h-20 sm:w-20" aria-hidden>
              🌱
            </span>
          )}
          <div>
            <h1 className="font-display text-3xl font-semibold leading-tight sm:text-4xl">{garden.name}</h1>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Chip>Zone {input.climate.zone}</Chip>
              <Chip tone="neutral">{seasonLabel}</Chip>
              <Chip tone="neutral">ZIP {input.zip}</Chip>
              {saved && (
                <Chip tone="sun">
                  <Check className="h-3 w-3" /> Saved
                </Chip>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2 no-print">
          <button type="button" onClick={share} className={buttonClass("secondary", "sm")}>
            <Share2 className="h-4 w-4" />
            {shared ? "Link copied" : "Share"}
          </button>
          {saved && (
            <Link href={`/garden/${garden.id}`} className={buttonClass("primary", "sm")}>
              Open in My Garden
            </Link>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="sticky top-16 z-20 -mx-4 mt-6 border-b border-line bg-cream/90 px-4 backdrop-blur-md no-print">
        <nav className="no-scrollbar flex gap-1 overflow-x-auto py-2" aria-label="Plan sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => selectTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={cx(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors",
                tab === t.id ? "bg-leaf-600 text-white" : "text-muted hover:bg-paper hover:text-ink",
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-6 animate-rise" key={tab}>
        {tab === "overview" && <OverviewTab plan={plan} input={input} today={today} tasks={{ done: tasks.done, toggle: saved ? tasks.toggle : undefined }} onTab={selectTab} />}
        {tab === "layout" && <LayoutTab plan={plan} input={input} />}
        {tab === "plants" && <PlantsTab plan={plan} />}
        {tab === "calendar" && <CalendarTab plan={plan} today={today} tasks={{ done: tasks.done, toggle: saved ? tasks.toggle : undefined }} />}
        {tab === "shopping" && <ShoppingTab plan={plan} gardenId={garden.id} />}
        {tab === "care" && <CareTab plan={plan} input={input} />}
      </div>
      {tasks.error && <p className="mt-4 text-sm text-clay-700">{tasks.error}</p>}

      {/* Save bar */}
      {!saved && viewer.canEdit && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 backdrop-blur-md pb-safe no-print">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pt-3">
            <div className="hidden min-w-0 sm:block">
              <p className="font-semibold">Keep this plan and get reminders</p>
              <p className="text-sm text-muted">Save it to My Garden for a weekly to-do list, task check-offs and a harvest log.</p>
            </div>
            <p className="text-sm font-semibold sm:hidden">Save for weekly reminders</p>
            <div className="flex shrink-0 flex-col items-end">
              <Button onClick={save} disabled={saving} size="md">
                {saving ? <Spinner className="h-4 w-4" /> : <Heart className="h-4 w-4" />}
                Save to My Garden
              </Button>
              {saveError && <p className="mt-1 text-xs text-clay-700">{saveError}</p>}
            </div>
          </div>
        </div>
      )}
      {!viewer.canEdit && (
        <div className="mt-8 rounded-2xl border border-line bg-paper p-5 text-center">
          <p className="font-semibold">Like this plan?</p>
          <p className="text-sm text-muted">Make one for your own space in about two minutes.</p>
          <Link href="/plan/new" className={buttonClass("primary", "md", "mt-3")}>
            Plan my garden
          </Link>
        </div>
      )}
    </div>
  );
}
