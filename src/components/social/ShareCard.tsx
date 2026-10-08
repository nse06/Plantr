"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, Globe, Lock, TriangleAlert } from "lucide-react";
import { Card, Spinner, cx } from "@/components/ui";

/** The owner's switch for showing a garden on their public profile and in Explore. */
export function ShareCard({
  gardenId,
  initialPublic,
  hidden,
  initialHandle,
  hasPhotos,
}: {
  gardenId: string;
  initialPublic: boolean;
  hidden: boolean;
  initialHandle: string | null;
  hasPhotos: boolean;
}) {
  const [isPublic, setPublic] = useState(initialPublic);
  const [handle, setHandle] = useState(initialHandle);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/gardens/${gardenId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ public: !isPublic }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { isPublic?: boolean; handle?: string; error?: string } | null;
    if (res?.ok && data) {
      setPublic(Boolean(data.isPublic));
      if (data.handle) setHandle(data.handle);
    } else setError(data?.error ?? "Couldn't change that. Try again.");
    setBusy(false);
  }

  async function copy() {
    const url = `${window.location.origin}/g/${gardenId}`;
    try {
      if (navigator.share) await navigator.share({ title: "My garden on Plantr", url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {}
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            {isPublic ? <Globe className="h-5 w-5 text-leaf-600" /> : <Lock className="h-5 w-5 text-faint" />}
            Share on your profile
          </h2>
          <p className="mt-1 text-sm text-muted">
            {isPublic
              ? "Anyone can see this garden's photos, plants and progress."
              : "Show this garden's photos, plants and progress on your public profile and in Explore."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isPublic}
          aria-label="Share on your profile"
          disabled={busy}
          onClick={() => void toggle()}
          className={cx(
            "relative mt-1 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-60",
            isPublic ? "bg-leaf-600" : "bg-line-strong",
          )}
        >
          {busy ? (
            <Spinner className="mx-auto h-4 w-4 text-white" />
          ) : (
            <span className={cx("inline-block h-5 w-5 rounded-full bg-white shadow transition-transform", isPublic ? "translate-x-6" : "translate-x-1")} />
          )}
        </button>
      </div>

      {isPublic && (
        <div className="mt-4 space-y-2.5">
          {hidden && (
            <p className="flex gap-2 rounded-xl bg-sun-50 px-3 py-2 text-sm text-sun-600">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              This garden is hidden from public pages while we review a report.
            </p>
          )}
          <div className="flex gap-2">
            <Link href={`/g/${gardenId}`} className="inline-flex h-9 flex-1 items-center justify-center rounded-full border border-line-strong text-sm font-semibold hover:bg-leaf-50">
              View public page
            </Link>
            <button type="button" onClick={() => void copy()} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong px-3 text-sm font-semibold hover:bg-leaf-50">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Share link"}
            </button>
          </div>
          {!hasPhotos && <p className="text-sm text-leaf-700">Tip: add a photo so your garden stands out in Explore.</p>}
          {handle && (
            <p className="text-xs text-faint">
              On your profile at{" "}
              <Link href={`/u/${handle}`} className="font-semibold text-leaf-700 hover:underline">
                /u/{handle}
              </Link>
              . <Link href="/account#profile" className="hover:underline">Edit profile</Link>
            </p>
          )}
        </div>
      )}
      <p className="mt-3 text-xs text-faint">We never show your ZIP code, only your state and growing zone.</p>
      {error && <p className="mt-2 text-sm text-clay-700">{error}</p>}
    </Card>
  );
}
