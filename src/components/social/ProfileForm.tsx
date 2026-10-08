"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Spinner } from "@/components/ui";

/** Edit the public profile: handle, display name and a short bio. */
export function ProfileForm({
  handle: initialHandle,
  displayName: initialName,
  bio: initialBio,
}: {
  handle: string | null;
  displayName: string | null;
  bio: string | null;
}) {
  const router = useRouter();
  const [handle, setHandle] = useState(initialHandle ?? "");
  const [displayName, setDisplayName] = useState(initialName ?? "");
  const [bio, setBio] = useState(initialBio ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState("saving");
    setError(null);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...(handle.trim() ? { handle: handle.trim() } : {}), displayName, bio }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { error?: string } | null;
    if (res?.ok) {
      setState("saved");
      router.refresh();
      setTimeout(() => setState("idle"), 2000);
    } else {
      setError(data?.error ?? "Couldn't save your profile. Try again.");
      setState("idle");
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <label className="block">
        <span className="text-sm font-semibold">Profile name</span>
        <span className="mt-1 flex items-center rounded-xl border border-line-strong bg-paper focus-within:border-leaf-500">
          <span className="pl-3 text-sm text-faint">/u/</span>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24))}
            placeholder="sunny-basil-42"
            autoCapitalize="none"
            autoCorrect="off"
            className="h-11 w-full rounded-xl bg-transparent px-1 focus:outline-none"
          />
        </span>
        <span className="mt-1 block text-xs text-faint">3–24 lowercase letters, numbers or hyphens.{!initialHandle && " Leave it blank and we'll pick a fun one."}</span>
      </label>
      <label className="block">
        <span className="text-sm font-semibold">Display name</span>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value.slice(0, 40))}
          placeholder="Optional, e.g. Sam's Balcony"
          className="mt-1 h-11 w-full rounded-xl border border-line-strong bg-paper px-3 focus:border-leaf-500 focus:outline-none"
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold">About you</span>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, 200))}
          rows={2}
          placeholder="Optional: Second-year gardener growing salsa on a sunny deck."
          className="mt-1 w-full rounded-xl border border-line-strong bg-paper p-3 focus:border-leaf-500 focus:outline-none"
        />
      </label>
      {error && <p className="rounded-xl bg-clay-50 px-4 py-3 text-sm text-clay-700">{error}</p>}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={state === "saving"}>
          {state === "saving" ? <Spinner /> : state === "saved" ? "Saved" : "Save profile"}
        </Button>
        {initialHandle && (
          <Link href={`/u/${initialHandle}`} className="text-sm font-semibold text-leaf-700 hover:underline">
            View profile
          </Link>
        )}
      </div>
      <p className="text-xs text-faint">Only gardens you choose to share appear on your profile. Your email is never shown.</p>
    </form>
  );
}
