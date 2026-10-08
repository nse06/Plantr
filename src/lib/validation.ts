import { z } from "zod";
import { PLANTS_BY_ID } from "@/lib/garden/plants";

// Validation for everything the browser sends us. Never trust client input.

const goal = z.enum([
  "salad",
  "salsa",
  "herbs",
  "pollinators",
  "kids",
  "pizza",
  "cooking-greens",
  "preserving",
  "low-maintenance",
]);

const mmdd = z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);

const bed = z.object({
  kind: z.literal("bed"),
  name: z.string().trim().max(40).optional(),
  widthFt: z.number().min(1).max(40),
  lengthFt: z.number().min(1).max(40),
  raised: z.boolean(),
});

const containers = z.object({
  kind: z.literal("containers"),
  name: z.string().trim().max(40).optional(),
  count: z.number().int().min(1).max(50),
  // Indoor pots go down to a 4-inch pot (about a quart).
  gallons: z.number().min(0.25).max(50),
  potIn: z.number().int().min(4).max(16).optional(),
});

const indoorSetup = z.object({
  window: z.enum(["south", "west", "east", "north", "unsure"]),
  growLight: z.enum(["have", "buy", "none"]),
  pets: z.boolean(),
});

const spaceType = z.enum(["in-ground", "raised-bed", "containers", "mixed", "indoor"]);

export const photoAnalysisSchema = z.object({
  isGardenSpace: z.boolean(),
  spaceType,
  widthFt: z.number().min(0).max(100),
  lengthFt: z.number().min(0).max(100),
  bedCount: z.number().min(0).max(20),
  containerCount: z.number().min(0).max(50),
  sun: z.enum(["full", "partial", "shade"]),
  sunReason: z.string().max(400),
  confidence: z.enum(["low", "medium", "high"]),
  summary: z.string().max(600),
  observations: z.array(z.string().max(300)).max(6),
  concerns: z.array(z.string().max(300)).max(6),
  sillInches: z.number().min(0).max(240).nullable().optional(),
});

export const planRequestSchema = z
  .object({
    zip: z.string().regex(/^\d{5}$/, "Enter a 5-digit U.S. ZIP code"),
    frost: z.object({ lastFrost: mmdd, firstFrost: mmdd }).nullable().optional(),
    spaceType,
    areas: z.array(z.discriminatedUnion("kind", [bed, containers])).min(1).max(10),
    bedsReady: z.boolean(),
    sun: z.enum(["full", "partial", "shade"]),
    goals: z.array(goal).max(9),
    wants: z
      .array(z.string())
      .max(40)
      .transform((ids) => [...new Set(ids.filter((id) => id in PLANTS_BY_ID))]),
    notes: z.string().max(1000).default(""),
    household: z.number().int().min(1).max(12),
    experience: z.enum(["new", "some", "experienced"]),
    time: z.enum(["minimal", "moderate", "plenty"]),
    season: z.enum(["spring", "fall", "indoor"]),
    year: z.number().int().min(2024).max(2100),
    indoor: indoorSetup.nullable().optional(),
    photo: photoAnalysisSchema.nullable().optional(),
    photoThumb: z
      .string()
      .max(200_000)
      .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/)
      .nullable()
      .optional(),
    today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    name: z.string().trim().max(60).optional(),
  })
  // Indoor gardens are pots only, run on the indoor calendar, and need their light details.
  .refine(
    (r) =>
      r.spaceType === "indoor"
        ? r.season === "indoor" && Boolean(r.indoor) && r.areas.every((a) => a.kind === "containers")
        : r.season !== "indoor",
    { message: "Indoor gardens need pots, light details and the indoor calendar." },
  );

export type PlanRequest = z.infer<typeof planRequestSchema>;

export const photoRequestSchema = z.object({
  mode: z.enum(["outdoor", "indoor"]).default("outdoor"),
  image: z
    .string()
    .max(7_000_000)
    .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "Unsupported image"),
});

export const journalSchema = z.object({
  kind: z.enum(["harvest", "note"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  plantId: z.string().max(40).nullable().optional(),
  amount: z.number().min(0).max(100_000).nullable().optional(),
  unit: z.enum(["lb", "oz", "count", "bunch", "cup"]).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});

const jpegDataUrl = (max: number) =>
  z
    .string()
    .max(max)
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/, "Upload a JPEG photo");

export const photoUploadSchema = z.object({
  image: jpegDataUrl(1_000_000),
  thumb: jpegDataUrl(250_000),
  caption: z.string().max(200).nullable().optional(),
});

export const shareSchema = z.object({ public: z.boolean() });

export const profileSchema = z.object({
  handle: z.string().max(40).optional(),
  displayName: z.string().max(80).nullable().optional(),
  bio: z.string().max(400).nullable().optional(),
});

export const reportSchema = z.object({
  type: z.enum(["garden", "photo"]),
  id: z.string().regex(/^[A-Za-z0-9]{6,32}$/),
  reason: z.enum(["spam", "inappropriate", "personal-info", "other"]),
});

export const moderationSchema = z.object({
  type: z.enum(["garden", "photo"]),
  id: z.string().regex(/^[A-Za-z0-9]{6,32}$/),
  action: z.enum(["keep", "remove"]),
});
