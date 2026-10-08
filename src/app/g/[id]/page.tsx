import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Eye, Lock, TriangleAlert } from "lucide-react";
import type { BedArea } from "@/lib/garden/types";
import { getCurrentUser } from "@/lib/server/auth";
import { getGarden } from "@/lib/server/gardens";
import { getPublicGarden, isPubliclyVisible, listPhotos } from "@/lib/server/social";
import { seasonLabel } from "@/lib/garden/progress";
import { initials, photoUrl } from "@/lib/sharing";
import { BedGrid, ContainerGrid, WindowsillView } from "@/components/garden/visuals";
import { PhotoJournal } from "@/components/social/PhotoJournal";
import { CheerButton } from "@/components/social/CheerButton";
import { ReportButton } from "@/components/social/ReportButton";
import { ShareLinkButton } from "@/components/social/ShareLinkButton";
import { ButtonLink, Card, Chip, Stat } from "@/components/ui";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const garden = await getGarden(id);
  if (!garden || !isPubliclyVisible(garden)) return { title: "Garden", robots: { index: false } };
  const [cover] = await listPhotos(garden.id, false);
  const description = garden.plan.summary.slice(0, 160);
  return {
    title: garden.name,
    description,
    openGraph: {
      title: `${garden.name} on Plantr`,
      description,
      images: cover ? [{ url: photoUrl(cover.id), width: cover.width, height: cover.height }] : undefined,
    },
  };
}

/** A garden as the public sees it: photos, what's growing, the layout and progress. */
export default async function PublicGardenPage({ params }: Props) {
  const { id } = await params;
  const [garden, viewer] = await Promise.all([getGarden(id), getCurrentUser()]);
  if (!garden) notFound();
  const data = await getPublicGarden(garden, viewer);
  if (!data) notFound();
  const { plan, input } = garden;
  const indoor = input.spaceType === "indoor";
  const bedArea = (areaId: string) => input.areas.find((a): a is BedArea => a.id === areaId && a.kind === "bed");
  const like = new URLSearchParams();
  for (const g of input.goals.slice(0, 3)) like.append("goal", g);
  if (indoor) like.set("space", "indoor");

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:pt-10">
      {data.isOwner && (
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-paper px-4 py-3 text-sm">
          {!garden.isPublic ? (
            <>
              <Lock className="h-4 w-4 text-faint" /> Only you can see this page. Turn on sharing from your garden page to show it to others.
            </>
          ) : garden.hidden ? (
            <>
              <TriangleAlert className="h-4 w-4 text-sun-600" /> Hidden from public pages while we review a report.
            </>
          ) : (
            <>
              <Eye className="h-4 w-4 text-leaf-600" /> This is how others see your garden.
            </>
          )}
          <Link href={`/garden/${garden.id}`} className="ml-auto font-semibold text-leaf-700 hover:underline">
            Back to my garden
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">{garden.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            {data.handle ? (
              <Link href={`/u/${data.handle}`} className="inline-flex items-center gap-2 font-semibold text-ink hover:text-leaf-700">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-leaf-100 text-xs font-bold text-leaf-700">{initials(data.ownerName)}</span>
                {data.ownerName}
              </Link>
            ) : (
              <span>{data.ownerName}</span>
            )}
            <Chip>{data.location}</Chip>
            <Chip tone="neutral">{seasonLabel(plan)}</Chip>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CheerButton gardenId={garden.id} initialCount={data.cheers} initialCheered={data.cheered} signedIn={Boolean(viewer)} isOwner={data.isOwner} />
          {isPubliclyVisible(garden) && <ShareLinkButton title={`${garden.name} on Plantr`} />}
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-8">
          <PhotoJournal gardenId={garden.id} initial={data.photos} editable={false} />

          <section>
            <h2 className="mb-3 font-display text-2xl font-semibold">{indoor ? "On the windowsill" : "The layout"}</h2>
            <div className="space-y-4">
              {plan.layouts.map((layout) => (
                <Card key={layout.areaId} className="p-4 sm:p-5">
                  <h3 className="mb-3 font-display text-lg font-semibold">{layout.name}</h3>
                  {layout.kind === "bed" ? (
                    <BedGrid layout={layout} raised={bedArea(layout.areaId)?.raised ?? true} selected={null} />
                  ) : indoor ? (
                    <WindowsillView layout={layout} selected={null} growLight={input.indoor?.growLight !== "none"} />
                  ) : (
                    <ContainerGrid layout={layout} selected={null} />
                  )}
                </Card>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <p className="text-[15px] leading-relaxed">{plan.summary}</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Stat label="Crops" value={plan.plants.length} hint={`${plan.stats.plantCount} plants`} />
              <Stat label="Tasks done" value={data.tasksDone} hint={`of ${plan.tasks.length}`} />
              <Stat label="Harvests" value={data.harvests} hint="logged" />
              <Stat label="Photos" value={data.photos.length} />
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 font-display text-lg font-semibold">What&apos;s growing</h2>
            <ul className="flex flex-wrap gap-1.5">
              {plan.plants.map((p) => (
                <li key={p.plantId} className="rounded-full bg-cream px-3 py-1.5 text-sm font-semibold">
                  {p.emoji} {p.name} <span className="font-normal text-faint">×{p.quantity}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="bg-gradient-to-br from-leaf-600 to-leaf-800 p-5 text-white">
            <p className="font-display text-xl font-semibold">Grow something like this</p>
            <p className="mt-1 text-sm text-leaf-100">Plantr builds a plan for your own space, climate and taste in about two minutes.</p>
            <ButtonLink href={`/plan/new?${like.toString()}`} variant="sun" className="mt-4">
              Plan my garden <ArrowRight className="h-4 w-4" />
            </ButtonLink>
          </Card>

          {!data.isOwner && isPubliclyVisible(garden) && (
            <div className="text-right">
              <ReportButton type="garden" id={garden.id} label="Report this garden" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
