import type { Metadata } from "next";
import Link from "next/link";
import { Card, buttonClass } from "@/components/ui";

export const metadata: Metadata = { title: "Unsubscribed", robots: { index: false } };

type Props = { searchParams: Promise<{ error?: string }> };

export default async function UnsubscribedPage({ searchParams }: Props) {
  const { error } = await searchParams;
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-4 py-12">
      <Card className="p-8 text-center">
        <span className="text-4xl" aria-hidden>
          {error ? "🤔" : "👋"}
        </span>
        <h1 className="mt-2 font-display text-3xl font-semibold">{error ? "Link not valid" : "You're unsubscribed"}</h1>
        <p className="mt-2 text-muted">
          {error
            ? "That unsubscribe link didn't work. You can turn weekly emails off in your account settings."
            : "You won't get weekly garden emails anymore. Your gardens are still here whenever you need them."}
        </p>
        <Link href={error ? "/account" : "/garden"} className={buttonClass("primary", "md", "mt-6")}>
          {error ? "Account settings" : "Go to My Garden"}
        </Link>
      </Card>
    </div>
  );
}
