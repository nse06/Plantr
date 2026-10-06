"use client";

import { useEffect } from "react";
import Link from "next/link";
import { buttonClass } from "@/components/ui";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-16 text-center">
      <span className="text-5xl" aria-hidden>
        🥀
      </span>
      <h1 className="mt-4 font-display text-3xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-muted">Sorry about that. Please try again in a moment.</p>
      <div className="mt-6 flex gap-2">
        <button type="button" onClick={() => retry()} className={buttonClass("primary")}>
          Try again
        </button>
        <Link href="/" className={buttonClass("secondary")}>
          Home
        </Link>
      </div>
    </div>
  );
}
