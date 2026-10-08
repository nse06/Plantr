"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, LogOut, Trash2 } from "lucide-react";
import { Card, cx } from "@/components/ui";

export function AccountSettings({ email, digest: initialDigest }: { email: string; digest: boolean }) {
  const router = useRouter();
  const [digest, setDigest] = useState(initialDigest);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function toggleDigest() {
    const next = !digest;
    setDigest(next);
    const res = await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ digest: next }),
    }).catch(() => null);
    if (!res?.ok) setDigest(!next);
  }

  async function deleteAccount() {
    setBusy(true);
    const res = await fetch("/api/account", { method: "DELETE" }).catch(() => null);
    if (res?.ok) {
      router.push("/");
      router.refresh();
    } else setBusy(false);
  }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <p className="text-sm text-muted">Signed in as</p>
        <p className="text-lg font-semibold">{email}</p>
        <form method="post" action="/api/auth/logout" className="mt-4">
          <button type="submit" className="inline-flex items-center gap-1.5 text-sm font-semibold text-leaf-700 hover:underline">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </form>
      </Card>

      <Card className="flex items-start gap-4 p-5">
        <Bell className="mt-0.5 h-5 w-5 shrink-0 text-leaf-600" />
        <div className="flex-1">
          <p className="font-semibold">Weekly garden email</p>
          <p className="text-sm text-muted">A short note each week with exactly what to do in your saved gardens, plus any new cheers on gardens you share.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={digest}
          aria-label="Weekly garden email"
          onClick={toggleDigest}
          className={cx("relative h-7 w-12 shrink-0 rounded-full transition-colors", digest ? "bg-leaf-600" : "bg-line-strong")}
        >
          <span className={cx("absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all", digest ? "left-6" : "left-1")} />
        </button>
      </Card>

      <Card className="p-5">
        <p className="flex items-center gap-2 font-semibold text-clay-700">
          <Trash2 className="h-4 w-4" /> Delete account
        </p>
        <p className="mt-1 text-sm text-muted">Permanently deletes your account, gardens, task history and harvest log. This can&apos;t be undone.</p>
        <label className="mt-3 block text-sm">
          Type <span className="font-mono font-semibold">delete</span> to confirm
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="mt-1 h-10 w-full rounded-xl border border-line-strong bg-paper px-3"
          />
        </label>
        <button
          type="button"
          disabled={confirm.trim().toLowerCase() !== "delete" || busy}
          onClick={deleteAccount}
          className="mt-3 rounded-full border border-clay-100 bg-clay-50 px-4 py-2 text-sm font-semibold text-clay-700 disabled:opacity-40"
        >
          Delete my account
        </button>
      </Card>
    </div>
  );
}
