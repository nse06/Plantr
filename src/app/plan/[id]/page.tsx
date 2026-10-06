import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser, getGuestId } from "@/lib/server/auth";
import { canEdit, doneTaskIds, getGarden } from "@/lib/server/gardens";
import { todayISO } from "@/lib/garden/dates";
import { PlanView } from "@/components/plan/PlanView";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const garden = await getGarden(id);
  if (!garden) return { title: "Plan not found" };
  const crops = garden.plan.plants.map((p) => p.name).slice(0, 5).join(", ");
  return {
    title: garden.name,
    description: `A zone ${garden.zone} garden plan with ${crops}. Made with Plantr.`,
    robots: { index: false },
  };
}

export default async function PlanPage({ params }: Props) {
  const { id } = await params;
  const garden = await getGarden(id);
  if (!garden) notFound();
  const user = await getCurrentUser();
  const guestId = await getGuestId();
  const editable = canEdit(garden, user, guestId);
  const isOwner = Boolean(user && garden.ownerId === user.id);
  const done = isOwner ? [...((await doneTaskIds([garden.id])).get(garden.id) ?? [])] : [];

  return (
    <Suspense>
      <PlanView
        garden={{ id: garden.id, name: garden.name, status: garden.status, photo: garden.photo }}
        input={garden.input}
        plan={garden.plan}
        viewer={{ signedIn: Boolean(user), canEdit: editable, isOwner }}
        doneTaskIds={done}
        serverToday={todayISO()}
      />
    </Suspense>
  );
}
