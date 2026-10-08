"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cx } from "@/components/ui";

/** "Cheer" a public garden (a like). Signed-out visitors are sent to sign in first. */
export function CheerButton({
  gardenId,
  initialCount,
  initialCheered,
  signedIn,
  isOwner,
}: {
  gardenId: string;
  initialCount: number;
  initialCheered: boolean;
  signedIn: boolean;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [count, setCount] = useState(initialCount);
  const [cheered, setCheered] = useState(initialCheered);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (!signedIn) {
      router.push(`/login?next=${encodeURIComponent(`/g/${gardenId}`)}`);
      return;
    }
    setBusy(true);
    // Optimistic: flip right away, settle on the server's answer.
    setCheered(!cheered);
    setCount((n) => n + (cheered ? -1 : 1));
    const res = await fetch(`/api/gardens/${gardenId}/cheer`, { method: "POST" }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { cheered?: boolean; count?: number } | null;
    if (res?.ok && data) {
      setCheered(Boolean(data.cheered));
      setCount(data.count ?? 0);
    } else {
      setCheered(cheered);
      setCount(initialCount);
    }
    setBusy(false);
  }

  const label = `${count} ${count === 1 ? "cheer" : "cheers"}`;
  if (isOwner) {
    return (
      <span className="inline-flex h-10 items-center gap-1.5 rounded-full bg-leaf-50 px-4 text-sm font-semibold text-leaf-700">
        <span aria-hidden>🌱</span> {label}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy}
      aria-pressed={cheered}
      className={cx(
        "inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors",
        cheered ? "bg-leaf-600 text-white hover:bg-leaf-700" : "border border-line-strong bg-paper text-ink hover:border-leaf-400 hover:bg-leaf-50",
      )}
    >
      <span aria-hidden>🌱</span> {cheered ? "Cheered" : "Cheer"} · {count}
    </button>
  );
}
