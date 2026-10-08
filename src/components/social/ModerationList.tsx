"use client";

import { useState } from "react";
import Link from "next/link";
import { fmtShort } from "@/lib/garden/dates";
import { REPORT_REASONS, photoUrl } from "@/lib/sharing";
import { Button, Card, Chip } from "@/components/ui";

export interface ModerationItem {
  type: "garden" | "photo";
  id: string;
  count: number;
  reasons: string[];
  firstAt: string;
  hidden: boolean;
  gardenId: string | null;
  label: string;
}

/** Open reports for admins: keep (and restore) the content, or remove it. */
export function ModerationList({ initial }: { initial: ModerationItem[] }) {
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function act(item: ModerationItem, action: "keep" | "remove") {
    setError(null);
    const res = await fetch("/api/admin/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: item.type, id: item.id, action }),
    }).catch(() => null);
    if (res?.ok) setItems((list) => list.filter((x) => !(x.type === item.type && x.id === item.id)));
    else setError("That didn't work. Try again.");
  }

  if (items.length === 0) return <Card className="p-6 text-muted">No open reports. 🌻</Card>;
  return (
    <div className="space-y-3">
      {error && <p className="rounded-xl bg-clay-50 px-4 py-3 text-sm text-clay-700">{error}</p>}
      {items.map((item) => (
        <Card key={`${item.type}:${item.id}`} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          {item.type === "photo" && (
            // eslint-disable-next-line @next/next/no-img-element -- admins can see hidden photos
            <img src={photoUrl(item.id, "thumb")} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip tone="neutral">{item.type}</Chip>
              <Chip tone="clay">
                {item.count} report{item.count === 1 ? "" : "s"}
              </Chip>
              {item.hidden && <Chip tone="sun">Hidden</Chip>}
            </div>
            <p className="mt-1 truncate font-semibold">{item.label}</p>
            <p className="text-sm text-muted">
              {item.reasons.map((r) => REPORT_REASONS[r as keyof typeof REPORT_REASONS] ?? r).join(", ")} · since {fmtShort(item.firstAt.slice(0, 10))}
            </p>
            {item.gardenId && (
              <Link href={`/g/${item.gardenId}`} className="text-sm font-semibold text-leaf-700 hover:underline">
                Open garden
              </Link>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => void act(item, "keep")}>
              Keep
            </Button>
            <Button variant="danger" size="sm" onClick={() => void act(item, "remove")}>
              Remove
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
