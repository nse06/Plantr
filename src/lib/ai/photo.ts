import { createHash } from "node:crypto";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { PhotoAnalysis } from "@/lib/garden/types";
import { aiSettings, effortParam, modelParams, runAi, settingsKey } from "./client";
import { cacheGet, cacheKey, cacheSet, recordUsage } from "./usage";

// Reads a photo of someone's yard, patio, balcony or windowsill and estimates what the planner
// needs: what kind of space it is, roughly how big, and how much sun or light it gets.

/** Change this whenever the prompt or schema changes, so cached analyses from the old prompt aren't reused. */
const PROMPT_VERSION = "photo-2";
const CACHE_DAYS = 30;

// Enumerations are plain strings here and normalized below: one slightly-off value from the
// model (e.g. "partial sun") shouldn't throw away an otherwise good analysis.
const PhotoSchema = z.object({
  isGardenSpace: z.boolean().describe("False if the photo isn't a place someone could grow plants."),
  spaceType: z.string().describe('One of: "in-ground", "raised-bed", "containers", "mixed", "indoor".'),
  widthFt: z.number().describe("Estimated width of the plantable area (or of one existing bed), in feet."),
  lengthFt: z.number().describe("Estimated length of the plantable area (or of one existing bed), in feet."),
  bedCount: z.number().describe("Existing beds visible, or beds we suggest creating for in-ground space."),
  containerCount: z.number().describe("Containers visible or that would comfortably fit (indoors: 6-inch pots that fit)."),
  sillInches: z.number().describe("Indoors: usable length of the sill or shelf in inches. Outdoors: 0."),
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

You will see one photo of where someone wants to grow: outdoors (a yard, a patch of lawn, existing raised beds, a patio, deck or balcony) or indoors (a windowsill, or a shelf or table by a window). Estimate what a garden planner needs to know. Your numbers pre-fill a form that the person reviews and corrects, so give your best realistic estimate rather than refusing.

Outdoors:
- Space type: "raised-bed" if raised beds already exist, "in-ground" for lawn or open soil, "containers" for patios, decks, balconies or other hard surfaces, "mixed" if there's a clear combination.
- Size: use reference objects for scale. A standard door is 3 ft wide and 6 ft 8 in tall; privacy fences are usually 6 ft tall with 5.5 in boards; bricks are 8 in long; concrete pavers are 12–16 in; deck boards are about 5.5 in wide; cinder blocks are 16 in; a patio chair is about 2 ft wide; common raised-bed kits are 4×8 ft or 3×6 ft.
- For existing beds, give the size of one bed and the number of beds. For open lawn or soil, suggest a manageable beginner plot that fits in the visible space (usually 4×8 to 10×12 ft) rather than the whole yard, and say so in an observation.
- Sun: judge from shadows, sky visibility, trees, buildings and fences. "full" means 6+ hours of direct sun, "partial" 4–6 hours, "shade" under 4. You usually can't know the compass direction, so be modest: use "partial" with low confidence when the evidence is unclear.
- Observations: concrete, useful notes (grass to remove or smother with cardboard, a fence that would suit a trellis, a tree that may shade the area in the afternoon, a hose bib nearby). Concerns: real risks only (tree roots, soggy low spots, a steep slope, an overhang that blocks rain).

Indoors (spaceType "indoor"):
- Estimate the usable sill or shelf length in inches (standard windows are about 3 ft wide; sills are often 3–6 in deep) and how many 6-inch pots fit as containerCount. Set widthFt and lengthFt to 1 and bedCount to 0.
- Sun means light at the window: "full" for a large, bright, unobstructed window with direct sun, "partial" for moderate light, "shade" for a small, dim or blocked window. You can't tell which way it faces, so don't guess.
- Note what matters indoors: a shallow sill, a radiator or heating vent below, cold drafts, curtains or blinds, and anything blocking the light.

If the photo isn't a growing space (a person, a document, a room with no window in view), set isGardenSpace to false, confidence to low, and fill the remaining fields with sensible defaults.

Write for a friendly beginner audience: short, plain sentences, no jargon.`;

export type PhotoMode = "outdoor" | "indoor";

export async function analyzePhoto(
  base64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp",
  mode: PhotoMode = "outdoor",
): Promise<PhotoAnalysis | null> {
  const settings = aiSettings("photo");
  // Never pay twice for the same photo: key the result by a fingerprint of the image.
  const imageHash = createHash("sha256").update(base64).digest("base64url");
  const key = cacheKey("photo", PROMPT_VERSION, settingsKey(settings), mode, imageHash);
  const cached = await cacheGet<PhotoAnalysis>(key);
  if (cached) {
    await recordUsage("photo", settings.model, null, 0, "cached");
    return cached;
  }

  const response = await runAi("photo", settings, (client) =>
    client.beta.messages.parse({
      ...modelParams(settings),
      max_tokens: 4000,
      output_config: { ...effortParam(settings), format: betaZodOutputFormat(PhotoSchema) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            {
              type: "text",
              text:
                mode === "indoor"
                  ? "Here's the window where I want to grow plants indoors. What do you see?"
                  : "Here's the space I want to turn into a garden. What do you see?",
            },
          ],
        },
      ],
    }),
  );
  if (!response || response.stop_reason === "refusal" || !response.parsed_output) return null;
  const out = response.parsed_output;
  const clampFt = (n: number) => Math.min(60, Math.max(1, Math.round(n * 2) / 2));
  const spaceType = /indoor|window|sill|shelf/i.test(out.spaceType)
    ? "indoor"
    : /raised/i.test(out.spaceType)
      ? "raised-bed"
      : /contain|pot|patio|balcon|deck/i.test(out.spaceType)
        ? "containers"
        : /mix/i.test(out.spaceType)
          ? "mixed"
          : "in-ground";
  const analysis: PhotoAnalysis = {
    isGardenSpace: out.isGardenSpace,
    spaceType,
    sunReason: out.sunReason,
    summary: out.summary,
    sun: pick(out.sun, ["full", "partial", "shade"] as const, "partial"),
    confidence: pick(out.confidence, ["low", "medium", "high"] as const, "low"),
    widthFt: clampFt(out.widthFt),
    lengthFt: clampFt(out.lengthFt),
    bedCount: Math.min(8, Math.max(0, Math.round(out.bedCount))),
    containerCount: Math.min(30, Math.max(0, Math.round(out.containerCount))),
    sillInches: spaceType === "indoor" ? Math.min(240, Math.max(0, Math.round(out.sillInches))) || null : null,
    observations: out.observations.slice(0, 4),
    concerns: out.concerns.slice(0, 3),
  };
  await cacheSet(key, "photo", analysis, CACHE_DAYS);
  return analysis;
}
