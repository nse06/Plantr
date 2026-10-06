import type { Metadata } from "next";
import type { Goal } from "@/lib/garden/types";
import { GOALS } from "@/lib/garden/plants";
import { aiEnabled } from "@/lib/ai/client";
import { Wizard } from "@/components/wizard/Wizard";

export const metadata: Metadata = {
  title: "Plan your garden",
  description: "Answer a few quick questions and get a personalized garden layout, planting calendar and shopping list.",
};

type Props = { searchParams: Promise<{ goal?: string | string[] }> };

export default async function NewPlanPage({ searchParams }: Props) {
  const { goal } = await searchParams;
  const requested = (Array.isArray(goal) ? goal : goal ? [goal] : []).filter((g): g is Goal =>
    GOALS.some((x) => x.id === g),
  );
  return <Wizard aiEnabled={aiEnabled()} initialGoals={requested} />;
}
