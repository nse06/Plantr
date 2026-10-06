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
  gallons: z.number().min(1).max(50),
});

export const photoAnalysisSchema = z.object({
  isGardenSpace: z.boolean(),
  spaceType: z.enum(["in-ground", "raised-bed", "containers", "mixed"]),
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
});

export const planRequestSchema = z.object({
  zip: z.string().regex(/^\d{5}$/, "Enter a 5-digit U.S. ZIP code"),
  frost: z.object({ lastFrost: mmdd, firstFrost: mmdd }).nullable().optional(),
  spaceType: z.enum(["in-ground", "raised-bed", "containers", "mixed"]),
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
  season: z.enum(["spring", "fall"]),
  year: z.number().int().min(2024).max(2100),
  photo: photoAnalysisSchema.nullable().optional(),
  photoThumb: z
    .string()
    .max(200_000)
    .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/)
    .nullable()
    .optional(),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  name: z.string().trim().max(60).optional(),
});

export type PlanRequest = z.infer<typeof planRequestSchema>;

export const photoRequestSchema = z.object({
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
