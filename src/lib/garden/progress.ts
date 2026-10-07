import type { GardenPlan, PlanTask } from "./types";
import { addDays } from "./dates";

// Shared "what's due" logic for the dashboard, the garden page and the weekly email.

export function isOverdue(task: PlanTask, today: string): boolean {
  return task.date < today && task.category !== "harvest";
}

/** Tasks for the "This week" list: due in the next 7 days, plus recent open ones. */
export function weekTasks(plan: GardenPlan, done: Set<string>, today: string): PlanTask[] {
  const end = addDays(today, 7);
  const lookback = addDays(today, -14);
  return plan.tasks.filter((t) => {
    if (t.date >= today && t.date < end) return true;
    return t.date >= lookback && t.date < today && !done.has(t.id) && t.category !== "harvest";
  });
}

export function upcomingTasks(plan: GardenPlan, today: string, days = 21): PlanTask[] {
  const start = addDays(today, 7);
  const end = addDays(today, 7 + days);
  return plan.tasks.filter((t) => t.date >= start && t.date < end);
}

export function progress(plan: GardenPlan, done: Set<string>, today: string): { done: number; due: number; total: number } {
  const due = plan.tasks.filter((t) => t.date <= today && t.category !== "harvest");
  return {
    done: plan.tasks.filter((t) => done.has(t.id)).length,
    due: due.length,
    total: plan.tasks.length,
  };
}

export function nextTask(plan: GardenPlan, done: Set<string>, today: string): PlanTask | null {
  return plan.tasks.find((t) => t.date >= today && !done.has(t.id)) ?? null;
}

/** "Fall 2026", "2026 season" or "Indoor, year-round". */
export function seasonLabel(plan: Pick<GardenPlan, "season" | "year">): string {
  if (plan.season === "indoor") return "Indoor, year-round";
  return plan.season === "fall" ? `Fall ${plan.year}` : `${plan.year} season`;
}

export function seasonOver(plan: GardenPlan, today: string): boolean {
  const last = plan.plants.reduce((d, p) => (p.schedule.harvestEnd > d ? p.schedule.harvestEnd : d), "");
  return Boolean(last) && today > addDays(last, -14);
}
