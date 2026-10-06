"use client";

import { useState } from "react";
import Link from "next/link";
import type { PlanTask } from "@/lib/garden/types";
import { TaskItem } from "./tasks";

export interface WeekItem {
  gardenId: string;
  gardenName: string;
  task: PlanTask;
  done: boolean;
  overdue: boolean;
}

/** "This week" across all of a user's gardens, with optimistic check-off. */
export function WeekList({ items, showGarden }: { items: WeekItem[]; showGarden: boolean }) {
  const [done, setDone] = useState(() => new Set(items.filter((i) => i.done).map((i) => `${i.gardenId}:${i.task.id}`)));
  const [error, setError] = useState<string | null>(null);

  async function toggle(item: WeekItem) {
    const key = `${item.gardenId}:${item.task.id}`;
    const next = !done.has(key);
    const flip = (on: boolean) =>
      setDone((prev) => {
        const s = new Set(prev);
        if (on) s.add(key);
        else s.delete(key);
        return s;
      });
    flip(next);
    const res = await fetch(`/api/gardens/${item.gardenId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: item.task.id, done: next }),
    }).catch(() => null);
    if (!res?.ok) {
      flip(!next);
      setError("Couldn't save that change. Check your connection.");
    } else setError(null);
  }

  return (
    <div>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={`${item.gardenId}:${item.task.id}`}>
            {showGarden && (
              <Link href={`/garden/${item.gardenId}`} className="mb-1 ml-1 inline-block text-xs font-semibold text-leaf-700 hover:underline">
                {item.gardenName}
              </Link>
            )}
            <ul>
              <TaskItem
                task={item.task}
                done={done.has(`${item.gardenId}:${item.task.id}`)}
                overdue={item.overdue}
                onToggle={() => toggle(item)}
              />
            </ul>
          </div>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-clay-700">{error}</p>}
    </div>
  );
}
