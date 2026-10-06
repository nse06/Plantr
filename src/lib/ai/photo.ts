import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { PhotoAnalysis } from "@/lib/garden/types";
import { FALLBACK_BETA, MODEL, getClient, logAiError } from "./client";

// Reads a photo of someone's yard, patio or balcony and estimates what the planner needs:
// what kind of space it is, roughly how big, and how much sun it gets.

// Enumerations are plain strings here and normalized below: one slightly-off value from the
// model (e.g. "partial sun") shouldn't throw away an otherwise good analysis.
const PhotoSchema = z.object({
  isGardenSpace: z.boolean().describe("False if the photo is not an outdoor space someone could garden in."),
  spaceType: z.string().describe('One of: "in-ground", "raised-bed", "containers", "mixed".'),
  widthFt: z.number().describe("Estimated width of the plantable area (or of one existing bed), in feet."),
  lengthFt: z.number().describe("Estimated length of the plantable area (or of one existing bed), in feet."),
  bedCount: z.number().describe("Existing beds visible, or beds we suggest creating for in-ground space."),
  containerCount: z.number().describe("Containers visible or that would comfortably fit (0 if not a container space)."),
  sun: z.string().describe('One of: "full" (6+ hours of direct sun), "partial" (4-6 hours), "shade" (under 4 hours).'),
  sunReason: z.string().describe("One short sentence on the evidence for the sun estimate."),
  confidence: z.string().describe('One of: "low", "medium", "high".'),
  summary: z.string().describe("One warm, plain-English sentence describing the space for the gardener."),
  observations: z.array(z.string()).describe("2-4 short, practical observations useful for planning."),
  concerns: z.array(z.string()).describe("0-3 potential problems worth checking, or empty."),
});

function pick<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  const v = value.toLowerCase();
  return allowed.find((a) => v === a) ?? allowed.find((a) => v.includes(a)) ?? fallback;
}

const SYSTEM = `You are the garden-space analyst for Plantr, an app that helps beginner gardeners in the United States plan a vegetable and herb garden.

You will see one photo of a person's outdoor space: a yard, a patch of lawn, existing raised beds, a patio, deck or balcony. Estimate what a garden planner needs to know. Your numbers pre-fill a form that the person reviews and corrects, so give your best realistic estimate rather than refusing.

How to estimate:
- Space type: "raised-bed" if raised beds already exist, "in-ground" for lawn or open soil, "containers" for patios, decks, balconies or other hard surfaces, "mixed" if there's a clear combination.
- Size: use reference objects for scale. A standard door is 3 ft wide and 6 ft 8 in tall; privacy fences are usually 6 ft tall with 5.5 in boards; bricks are 8 in long; concrete pavers are 12–16 in; deck boards are about 5.5 in wide; cinder blocks are 16 in; a patio chair is about 2 ft wide; common raised-bed kits are 4×8 ft or 3×6 ft.
- For existing beds, give the size of one bed and the number of beds. For open lawn or soil, suggest a manageable beginner plot that fits in the visible space (usually 4×8 to 10×12 ft) rather than the whole yard, and say so in an observation.
- Sun: judge from shadows, sky visibility, trees, buildings and fences. "full" means 6+ hours of direct sun, "partial" 4–6 hours, "shade" under 4. You usually can't know the compass direction, so be modest: use "partial" with low confidence when the evidence is unclear.
- Observations: concrete, useful notes (e.g. grass that needs removing or smothering with cardboard, a fence that would suit a trellis, a tree that may shade the area in the afternoon, a hose bib nearby).
- Concerns: real risks only (e.g. large trees whose roots compete, low spots that may stay soggy, a steep slope, an overhang that blocks rain). Leave it empty if there's nothing notable.
- If the photo isn't an outdoor space (a person, a document, an indoor room), set isGardenSpace to false, confidence to low, and fill the remaining fields with sensible defaults for a small backyard plot.

Write for a friendly beginner audience: short, plain sentences, no jargon.`;

export async function analyzePhoto(base64: string, mediaType: "image/jpeg" | "image/png" | "image/webp"): Promise<PhotoAnalysis | null> {
  const client = getClient();
  if (!client) return null;
  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(PhotoSchema) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: "Here's the space I want to turn into a garden. What do you see?" },
          ],
        },
      ],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) return null;
    const out = response.parsed_output;
    const clampFt = (n: number) => Math.min(60, Math.max(1, Math.round(n * 2) / 2));
    const spaceType = /raised/i.test(out.spaceType)
      ? "raised-bed"
      : /contain|pot|patio|balcon|deck/i.test(out.spaceType)
        ? "containers"
        : /mix/i.test(out.spaceType)
          ? "mixed"
          : "in-ground";
    return {
      ...out,
      spaceType,
      sun: pick(out.sun, ["full", "partial", "shade"] as const, "partial"),
      confidence: pick(out.confidence, ["low", "medium", "high"] as const, "low"),
      widthFt: clampFt(out.widthFt),
      lengthFt: clampFt(out.lengthFt),
      bedCount: Math.min(8, Math.max(0, Math.round(out.bedCount))),
      containerCount: Math.min(30, Math.max(0, Math.round(out.containerCount))),
      observations: out.observations.slice(0, 4),
      concerns: out.concerns.slice(0, 3),
    };
  } catch (err) {
    logAiError("photo", err);
    return null;
  }
}
