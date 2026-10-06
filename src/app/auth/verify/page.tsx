import type { Metadata } from "next";
import Link from "next/link";
import { Card, buttonClass } from "@/components/ui";

export const metadata: Metadata = { title: "Finish signing in", robots: { index: false } };

type Props = { searchParams: Promise<{ token?: string }> };

/**
 * Landing page for the emailed sign-in link. Signing in takes one more tap (a POST), so
 * link-preview bots and email security scanners can't use up the one-time token.
 */
export default async function VerifyPage({ searchParams }: Props) {
  const { token } = await searchParams;
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12">
      <Card className="p-6 text-center sm:p-8">
        <span className="text-4xl" aria-hidden>
          🌿
        </span>
        {token ? (
          <>
            <h1 className="mt-2 font-display text-3xl font-semibold">One more tap</h1>
            <p className="mt-2 text-muted">Confirm it&apos;s you and we&apos;ll take you to your garden.</p>
            <form method="post" action="/api/auth/verify" className="mt-6">
              <input type="hidden" name="token" value={token} />
              <button type="submit" className={buttonClass("primary", "lg", "w-full")}>
                Continue to Plantr
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="mt-2 font-display text-3xl font-semibold">Link not valid</h1>
            <p className="mt-2 text-muted">This sign-in link is incomplete. Request a fresh one.</p>
            <Link href="/login" className={buttonClass("primary", "lg", "mt-6 w-full")}>
              Back to sign in
            </Link>
          </>
        )}
      </Card>
    </div>
  );
}
