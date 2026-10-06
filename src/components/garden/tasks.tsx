"use client";

import { useState, useTransition } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { PlanTask, TaskCategory } from "@/lib/garden/types";
import { fmtDay } from "@/lib/garden/dates";
import { cx } from "@/components/ui";

const CATEGORY: Record<TaskCategory, { label: string; dot: string }> = {
  prep: { label: "Prep", dot: "bg-clay-400" },
  plant: { label: "Plant", dot: "bg-leaf-500" },
  care: { label: "Care", dot: "bg-sky-500" },
  harvest: { label: "Harvest", dot: "bg-sun-400" },
  protect: { label: "Protect", dot: "bg-clay-500" },
};

/** Optimistic task check-off, persisted for saved gardens. */
export function useTaskDone(gardenId: string, initial: string[], persist: boolean) {
  const [done, setDone] = useState(() => new Set(initial));
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(taskId: string) {
    const next = !done.has(taskId);
    setDone((prev) => {
      const s = new Set(prev);
      if (next) s.add(taskId);
      else s.delete(taskId);
      return s;
    });
    if (!persist) return;
    startTransition(async () => {
      const res = await fetch(`/api/gardens/${gardenId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, done: next }),
      }).catch(() => null);
      if (!res?.ok) {
        setError("Couldn't save that change. Check your connection.");
        setDone((prev) => {
          const s = new Set(prev);
          if (next) s.delete(taskId);
          else s.add(taskId);
          return s;
        });
      } else {
        setError(null);
      }
    });
  }
  return { done, toggle, error };
}

export function TaskItem({
  task,
  done,
  onToggle,
  showDate = true,
  overdue = false,
}: {
  task: PlanTask;
  done: boolean;
  onToggle?: () => void;
  showDate?: boolean;
  overdue?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const cat = CATEGORY[task.category];
  return (
    <li className={cx("group flex gap-3 rounded-2xl border border-line bg-paper px-3 py-3 transition-colors sm:px-4", done && "bg-cream/70")}>
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={done}
          aria-label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
          className={cx(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
            done ? "border-leaf-600 bg-leaf-600 text-white" : "border-line-strong bg-paper hover:border-leaf-500",
          )}
        >
          {done && <Check className="h-4 w-4" strokeWidth={3} />}
        </button>
      ) : (
        <span className={cx("mt-2 h-2.5 w-2.5 shrink-0 rounded-full", cat.dot)} aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-start justify-between gap-2 text-left" aria-expanded={open}>
          <span>
            <span className={cx("block text-[15px] font-semibold leading-snug", done && "text-faint line-through")}>{task.title}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
              {showDate && <span className={cx(overdue && !done && "font-semibold text-clay-700")}>{overdue && !done ? `Overdue · ${fmtDay(task.date)}` : fmtDay(task.date)}</span>}
              <span className="inline-flex items-center gap-1">
                <span className={cx("h-1.5 w-1.5 rounded-full", cat.dot)} />
                {cat.label}
              </span>
            </span>
          </span>
          <ChevronDown className={cx("mt-1 h-4 w-4 shrink-0 text-faint transition-transform", open && "rotate-180")} />
        </button>
        {open && <p className="mt-2 text-sm leading-relaxed text-muted">{task.detail}</p>}
      </div>
    </li>
  );
}
