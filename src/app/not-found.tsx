import Link from "next/link";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-16 text-center">
      <span className="text-5xl" aria-hidden>
        🐌
      </span>
      <h1 className="mt-4 font-display text-3xl font-semibold">Nothing growing here</h1>
      <p className="mt-2 text-muted">We couldn&apos;t find that page or plan. It may have been deleted, or the link may be incomplete.</p>
      <div className="mt-6 flex gap-2">
        <Link href="/" className={buttonClass("secondary")}>
          Home
        </Link>
        <Link href="/plan/new" className={buttonClass("primary")}>
          Plan a garden
        </Link>
      </div>
    </div>
  );
}
