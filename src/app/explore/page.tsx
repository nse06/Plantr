import type { Metadata } from "next";
import Link from "next/link";
import { listExplore } from "@/lib/server/social";
import { GardenTile } from "@/components/social/GardenTile";
import { ButtonLink, Card, buttonClass } from "@/components/ui";

export const metadata: Metadata = {
  title: "Explore gardens",
  description: "See what other gardeners are growing: real plans, layouts and photos from Plantr gardens.",
};

const PAGE_SIZE = 24;

type Props = { searchParams: Promise<{ page?: string }> };

export default async function ExplorePage({ searchParams }: Props) {
  const page = Math.min(500, Math.max(1, Number((await searchParams).page) || 1));
  // One extra tells us whether there's another page.
  const cards = await listExplore(PAGE_SIZE + 1, (page - 1) * PAGE_SIZE);
  const more = cards.length > PAGE_SIZE;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:pt-12">
      <h1 className="font-display text-4xl font-semibold sm:text-5xl">Gardens growing on Plantr</h1>
      <p className="mt-2 max-w-2xl text-lg text-muted">
        Real plans and photos from gardeners like you, from backyard beds to kitchen windowsills. Share yours from your garden&apos;s page.
      </p>

      {cards.length ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.slice(0, PAGE_SIZE).map((card) => (
            <GardenTile key={card.id} card={card} />
          ))}
        </div>
      ) : (
        <Card className="mt-8 p-8 text-center">
          <span className="text-4xl" aria-hidden>
            🌱
          </span>
          <p className="mt-2 font-display text-xl font-semibold">No shared gardens yet</p>
          <p className="mt-1 text-muted">Be the first: plan a garden, save it, and turn on sharing.</p>
          <ButtonLink href="/plan/new" className="mt-5">
            Plan a garden
          </ButtonLink>
        </Card>
      )}

      {(page > 1 || more) && (
        <div className="mt-8 flex justify-between">
          {page > 1 ? (
            <Link href={page === 2 ? "/explore" : `/explore?page=${page - 1}`} className={buttonClass("secondary", "sm")}>
              Newer
            </Link>
          ) : (
            <span />
          )}
          {more && (
            <Link href={`/explore?page=${page + 1}`} className={buttonClass("secondary", "sm")}>
              Older
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
