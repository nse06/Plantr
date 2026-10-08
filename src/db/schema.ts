import { blob, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { GardenPlan, PlanInput } from "@/lib/garden/types";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    /** Weekly "what to do in your garden" email. */
    digest: integer("digest", { mode: "boolean" }).notNull().default(true),
    lastDigestAt: text("last_digest_at"),
    /** Public profile (/u/handle). Set the first time someone shares a garden. */
    handle: text("handle"),
    displayName: text("display_name"),
    bio: text("bio"),
    createdAt: text("created_at").notNull(),
  },
  // A separate unique index (not a UNIQUE column) so adding it doesn't rebuild the table.
  (t) => [uniqueIndex("users_handle_idx").on(t.handle)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    /** SHA-256 of the session token; the raw token only lives in the user's cookie. */
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const loginTokens = sqliteTable("login_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  email: text("email").notNull(),
  next: text("next"),
  /** Signed hash of the 6-digit code in the same email, for signing in on another device or app. */
  codeHash: text("code_hash"),
  /** Wrong code guesses; the code stops working after a few. */
  attempts: integer("attempts").notNull().default(0),
  expiresAt: integer("expires_at").notNull(),
  usedAt: integer("used_at"),
  createdAt: integer("created_at").notNull(),
});

export const gardens = sqliteTable(
  "gardens",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").references(() => users.id, { onDelete: "cascade" }),
    /** Anonymous creator, so people can plan before signing up and claim the plan later. */
    guestId: text("guest_id"),
    name: text("name").notNull(),
    status: text("status", { enum: ["draft", "active", "archived"] })
      .notNull()
      .default("draft"),
    zip: text("zip").notNull(),
    zone: text("zone").notNull(),
    season: text("season", { enum: ["spring", "fall", "indoor"] }).notNull(),
    year: integer("year").notNull(),
    input: text("input", { mode: "json" }).$type<PlanInput>().notNull(),
    plan: text("plan", { mode: "json" }).$type<GardenPlan>().notNull(),
    /** Small JPEG thumbnail as a data URL (we never keep the full-size photo). */
    photo: text("photo"),
    /** Shown on the owner's public profile and in Explore. Off until the owner turns it on. */
    isPublic: integer("is_public", { mode: "boolean" }).notNull().default(false),
    publishedAt: text("published_at"),
    /** Hidden from public view by moderation (reports or an admin). */
    hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("gardens_owner_idx").on(t.ownerId),
    index("gardens_guest_idx").on(t.guestId),
    index("gardens_public_idx").on(t.isPublic, t.updatedAt),
  ],
);

export const taskStatus = sqliteTable(
  "task_status",
  {
    gardenId: text("garden_id")
      .notNull()
      .references(() => gardens.id, { onDelete: "cascade" }),
    taskId: text("task_id").notNull(),
    doneAt: text("done_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.gardenId, t.taskId] })],
);

export const journal = sqliteTable(
  "journal",
  {
    id: text("id").primaryKey(),
    gardenId: text("garden_id")
      .notNull()
      .references(() => gardens.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    kind: text("kind", { enum: ["harvest", "note"] }).notNull(),
    plantId: text("plant_id"),
    amount: real("amount"),
    unit: text("unit"),
    note: text("note"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("journal_garden_idx").on(t.gardenId)],
);

export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: integer("window_start").notNull(),
  count: integer("count").notNull(),
});

/** Photo updates a gardener posts to a garden. Stored as JPEG bytes (a large and a small size). */
export const gardenPhotos = sqliteTable(
  "garden_photos",
  {
    id: text("id").primaryKey(),
    gardenId: text("garden_id")
      .notNull()
      .references(() => gardens.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    image: blob("image", { mode: "buffer" }).notNull(),
    thumb: blob("thumb", { mode: "buffer" }).notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    caption: text("caption"),
    hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("garden_photos_garden_idx").on(t.gardenId, t.createdAt)],
);

/** A "cheer" (like) on a public garden: one per person per garden. */
export const cheers = sqliteTable(
  "cheers",
  {
    gardenId: text("garden_id")
      .notNull()
      .references(() => gardens.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.gardenId, t.userId] })],
);

/** Reports of public content. Enough distinct reports hide it until an admin reviews it. */
export const reports = sqliteTable(
  "reports",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    targetType: text("target_type", { enum: ["garden", "photo"] }).notNull(),
    targetId: text("target_id").notNull(),
    /** The reporter's user id, or a hash of their IP address when signed out. */
    reporterKey: text("reporter_key").notNull(),
    reason: text("reason").notNull(),
    createdAt: text("created_at").notNull(),
    resolvedAt: text("resolved_at"),
  },
  (t) => [uniqueIndex("reports_once_idx").on(t.targetType, t.targetId, t.reporterKey)],
);

/** Every AI call: tokens, estimated cost and outcome. Powers cost reporting and the daily budget guard. */
export const aiUsage = sqliteTable(
  "ai_usage",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    feature: text("feature").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    /** Part of outputTokens spent on reasoning; the main lever behind the effort setting. */
    thinkingTokens: integer("thinking_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    costUsd: real("cost_usd").notNull().default(0),
    latencyMs: integer("latency_ms").notNull().default(0),
    /** ok | cached | refusal | error */
    outcome: text("outcome").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("ai_usage_created_idx").on(t.createdAt)],
);

/** Results of identical AI requests, reused instead of paying for them twice. */
export const aiCache = sqliteTable("ai_cache", {
  key: text("key").primaryKey(),
  feature: text("feature").notNull(),
  value: text("value", { mode: "json" }).notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});

/** Taps on shopping-list store links: which item and which store, never who tapped. */
export const shopClicks = sqliteTable(
  "shop_clicks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    merchant: text("merchant").notNull(),
    /** Shopping item id, e.g. plant:tomato or supply:cages ("pots" for any pot line). */
    item: text("item").notNull(),
    /** The link carried an affiliate tag at the time, so the tap could earn a commission. */
    affiliate: integer("affiliate", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("shop_clicks_created_idx").on(t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type GardenPhoto = typeof gardenPhotos.$inferSelect;
export type Garden = typeof gardens.$inferSelect;
export type JournalEntry = typeof journal.$inferSelect;
