import type { GardenPlan, PlanInput } from "@/lib/garden/types";
import { fmtMMDD, fmtShort } from "@/lib/garden/dates";
import { FALLBACK_BETA, MODEL, getClient, logAiError } from "./client";

// "Ask Plantr": short, garden-aware answers to everyday questions
// ("my tomato leaves have yellow spots", "can I still plant lettuce?").

const SYSTEM = `You are Plantr, a friendly, knowledgeable gardening helper for beginner and casual gardeners in the United States.

You answer questions about the person's own garden. You know their location, frost dates, what they're growing and their calendar (below). Use it: answer for their zone, their dates and their plants, not generically.

How to answer:
- Lead with the direct answer, then the one or two things to do next. Keep it under 140 words.
- Plain text only: no markdown headings, bold or tables. Short paragraphs, or a few lines starting with "• " when listing steps.
- Be honest about uncertainty. Diagnosing plant problems from a description is guesswork, so name the most likely cause, how to tell, and what to do. Suggest their local Cooperative Extension office for anything serious or uncertain.
- Prefer organic, low-risk fixes first. Never recommend unsafe pesticide use, and remind people to follow label directions when a product comes up.
- If a question has nothing to do with gardening, say briefly that you can only help with their garden.`;

export function gardenContext(input: PlanInput, plan: GardenPlan, today: string): string {
  const c = input.climate;
  const plants = plan.plants
    .map(
      (p) =>
        `${p.quantity} ${p.name}${p.variety ? ` ('${p.variety}')` : ""}: plant ${fmtShort(p.schedule.plantOut)}, harvest ${fmtShort(
          p.schedule.harvestStart,
        )}–${fmtShort(p.schedule.harvestEnd)}`,
    )
    .join("; ");
  const upcoming = plan.tasks
    .filter((t) => t.date >= today)
    .slice(0, 6)
    .map((t) => `${fmtShort(t.date)}: ${t.title}`)
    .join("; ");
  return [
    `Today: ${today}.`,
    `Location: ZIP ${input.zip}, zone ${c.zone}${c.frostFree ? " (frost-free)" : `, last frost ~${fmtMMDD(c.lastFrost)}, first frost ~${fmtMMDD(c.firstFrost)}`}.`,
    `Garden: ${plan.season === "fall" ? "fall" : "spring/summer"} ${plan.year} plan; sun: ${input.sun}; experience: ${input.experience}.`,
    `Growing: ${plants || "nothing yet"}.`,
    upcoming ? `Coming up: ${upcoming}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function askPlantr(question: string, context: string): Promise<string | null> {
  const client = getClient();
  if (!client) return null;
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `About my garden:\n${context}\n\nMy question: ${question.slice(0, 800)}`,
        },
      ],
    });
    if (response.stop_reason === "refusal") return null;
    const text = response.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return text || null;
  } catch (err) {
    logAiError("ask", err);
    return null;
  }
}
