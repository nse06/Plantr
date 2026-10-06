import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { GardenPlan, PlanInput } from "@/lib/garden/types";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  /** Weekly "what to do in your garden" email. */
  digest: integer("digest", { mode: "boolean" }).notNull().default(true),
  lastDigestAt: text("last_digest_at"),
  createdAt: text("created_at").notNull(),
});

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
    season: text("season", { enum: ["spring", "fall"] }).notNull(),
    year: integer("year").notNull(),
    input: text("input", { mode: "json" }).$type<PlanInput>().notNull(),
    plan: text("plan", { mode: "json" }).$type<GardenPlan>().notNull(),
    /** Small JPEG thumbnail as a data URL (we never keep the full-size photo). */
    photo: text("photo"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("gardens_owner_idx").on(t.ownerId), index("gardens_guest_idx").on(t.guestId)],
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

export type User = typeof users.$inferSelect;
export type Garden = typeof gardens.$inferSelect;
export type JournalEntry = typeof journal.$inferSelect;
