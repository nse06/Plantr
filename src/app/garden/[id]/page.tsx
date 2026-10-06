import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server/auth";
import { doneTaskIds, getGarden, listJournal } from "@/lib/server/gardens";
import { todayISO } from "@/lib/garden/dates";
import { aiEnabled } from "@/lib/ai/client";
import { GardenHome } from "@/components/garden/GardenHome";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ welcome?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const garden = await getGarden(id);
  return { title: garden?.name ?? "My Garden" };
}

export default async function GardenPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { welcome } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/garden/${id}`)}`);
  const garden = await getGarden(id);
  if (!garden || garden.ownerId !== user.id) notFound();
  // Drafts live on the plan page until they're saved.
  if (garden.status === "draft") redirect(`/plan/${id}`);

  const [done, journal] = await Promise.all([doneTaskIds([garden.id]), listJournal(garden.id)]);
  return (
    <GardenHome
      garden={{ id: garden.id, name: garden.name, photo: garden.photo, status: garden.status }}
      input={garden.input}
      plan={garden.plan}
      doneTaskIds={[...(done.get(garden.id) ?? [])]}
      journal={journal}
      aiEnabled={aiEnabled()}
      serverToday={todayISO()}
      welcome={welcome === "1"}
    />
  );
}
