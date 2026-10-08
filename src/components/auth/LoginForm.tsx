"use client";

import { useState } from "react";
import { Mail, MailCheck } from "lucide-react";
import { Button, Spinner } from "@/components/ui";

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "verifying">("idle");
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, next }),
      });
      const data = (await res.json()) as { ok?: boolean; devLink?: string; devCode?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      setDevLink(data.devLink ?? null);
      setDevCode(data.devCode ?? null);
      setCode("");
      setCodeError(null);
      setState("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setState("idle");
    }
  }

  async function verify(value: string) {
    setState("verifying");
    setCodeError(null);
    try {
      const res = await fetch("/api/auth/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: value }),
      });
      const data = (await res.json()) as { ok?: boolean; next?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      // A full page load so the header and every server component see the new session.
      window.location.assign(data.next || next);
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : "Something went wrong.");
      setState("sent");
    }
  }

  if (state === "sent" || state === "verifying") {
    const digits = code.replace(/\D/g, "");
    return (
      <div className="animate-rise">
        <div className="text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-leaf-100 text-leaf-700">
            <MailCheck className="h-7 w-7" />
          </span>
          <h2 className="mt-4 font-display text-2xl font-semibold">Check your email</h2>
          <p className="mt-2 text-muted">
            We sent a 6-digit code to <span className="font-semibold text-ink">{email}</span>. Enter it below, or tap the link in the email.
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (digits.length === 6) void verify(digits);
          }}
          className="mt-5 space-y-3"
        >
          <label className="block">
            <span className="sr-only">6-digit code</span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={7}
              value={code}
              onChange={(e) => {
                const value = e.target.value.replace(/[^\d ]/g, "");
                setCode(value);
                const d = value.replace(/\D/g, "");
                // Autofilled or fully typed: sign in right away.
                if (d.length === 6 && state === "sent") void verify(d);
              }}
              placeholder="123456"
              aria-label="6-digit code"
              className="h-14 w-full rounded-2xl border border-line-strong bg-paper text-center text-2xl font-semibold tracking-[0.4em] placeholder:tracking-[0.4em] placeholder:text-line-strong focus:border-leaf-500 focus:outline-none"
            />
          </label>
          {codeError && <p className="rounded-xl bg-clay-50 px-4 py-3 text-sm text-clay-700">{codeError}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={state === "verifying" || digits.length !== 6}>
            {state === "verifying" ? <Spinner /> : "Sign in"}
          </Button>
        </form>
        {(devCode || devLink) && (
          <div className="mt-4 space-y-2 rounded-xl bg-sun-50 px-4 py-3 text-center text-sm text-sun-600 ring-1 ring-sun-100">
            {devCode && (
              <p>
                Development mode: your code is <span className="font-bold tracking-widest">{devCode}</span>
              </p>
            )}
            {devLink && (
              <a href={devLink} className="block font-semibold underline">
                Or open the sign-in link
              </a>
            )}
          </div>
        )}
        <button type="button" onClick={() => setState("idle")} className="mt-6 block w-full text-sm font-semibold text-leaf-700 hover:underline">
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block">
        <span className="text-sm font-semibold">Email address</span>
        <span className="relative mt-1 block">
          <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-faint" />
          <input
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="h-13 w-full rounded-2xl border border-line-strong bg-paper py-3.5 pl-12 pr-4 text-[17px] focus:border-leaf-500 focus:outline-none"
          />
        </span>
      </label>
      {error && <p className="rounded-xl bg-clay-50 px-4 py-3 text-sm text-clay-700">{error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={state === "sending"}>
        {state === "sending" ? <Spinner /> : "Email me a sign-in code"}
      </Button>
      <p className="text-center text-xs text-faint">No password needed. New here? This creates your free account.</p>
    </form>
  );
}
