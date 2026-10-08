"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { REPORT_REASONS, type ReportReason } from "@/lib/sharing";

/** A quiet "Report" link with a short list of reasons. */
export function ReportButton({ type, id, label = "Report" }: { type: "garden" | "photo"; id: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function send(reason: ReportReason) {
    setState("sending");
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, id, reason }),
    }).catch(() => null);
    setState(res?.ok ? "done" : "error");
    setOpen(false);
  }

  if (state === "done") return <span className="text-sm text-muted">Thanks. We&apos;ll take a look.</span>;
  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-sm text-faint hover:text-clay-700"
      >
        <Flag className="h-3.5 w-3.5" /> {label}
      </button>
      {state === "error" && <span className="ml-2 text-sm text-clay-700">Couldn&apos;t send that.</span>}
      {open && (
        <span className="absolute right-0 z-20 mt-2 block w-64 rounded-2xl border border-line bg-paper p-2 text-left shadow-[var(--shadow-lift)]">
          <span className="block px-2 py-1 text-xs font-semibold uppercase tracking-wide text-faint">What&apos;s wrong?</span>
          {(Object.keys(REPORT_REASONS) as ReportReason[]).map((r) => (
            <button
              key={r}
              type="button"
              disabled={state === "sending"}
              onClick={() => void send(r)}
              className="block w-full rounded-xl px-2 py-2 text-left text-sm hover:bg-cream"
            >
              {REPORT_REASONS[r]}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
