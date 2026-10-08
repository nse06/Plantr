import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Garden, JournalEntry, User } from "@/db/schema";
import type { GardenPlan, PlanInput } from "@/lib/garden/types";
import { randomId } from "./crypto";
import { deleteSharingFor } from "./social";

// Data access for gardens, task completion and the garden journal.

export async function insertGarden(values: {
  ownerId: string | null;
  guestId: string | null;
  name: string;
  input: PlanInput;
  plan: GardenPlan;
  photo: string | null;
}): Promise<Garden> {
  const now = new Date().toISOString();
  const row = {
    id: randomId(14),
    ownerId: values.ownerId,
    guestId: values.guestId,
    name: values.name,
    status: "draft" as const,
    zip: values.input.zip,
    zone: values.input.climate.zone,
    season: values.input.season,
    year: values.input.year,
    input: values.input,
    plan: values.plan,
    photo: values.photo,
    isPublic: false,
    publishedAt: null,
    hidden: false,
    createdAt: now,
    updatedAt: now,
  };
  await getDb().insert(schema.gardens).values(row);
  return row;
}

export async function getGarden(id: string): Promise<Garden | null> {
  if (!/^[A-Za-z0-9]{6,32}$/.test(id)) return null;
  const rows = await getDb().select().from(schema.gardens).where(eq(schema.gardens.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Owner, or the anonymous creator of an unclaimed draft. */
export function canEdit(garden: Garden, user: User | null, guestId: string | null): boolean {
  if (garden.ownerId) return user?.id === garden.ownerId;
  return Boolean(guestId && garden.guestId === guestId);
}

export async function listGardens(userId: string): Promise<Garden[]> {
  return getDb()
    .select()
    .from(schema.gardens)
    .where(and(eq(schema.gardens.ownerId, userId), inArray(schema.gardens.status, ["active", "archived"])))
    .orderBy(desc(schema.gardens.updatedAt));
}

/** After sign-in, attach plans made as a guest on this device to the account. */
export async function claimGuestGardens(userId: string, guestId: string | null): Promise<void> {
  if (!guestId) return;
  await getDb()
    .update(schema.gardens)
    .set({ ownerId: userId })
    .where(and(eq(schema.gardens.guestId, guestId), isNull(schema.gardens.ownerId)));
}

export async function saveGarden(id: string, userId: string): Promise<void> {
  await getDb()
    .update(schema.gardens)
    .set({ ownerId: userId, status: "active", updatedAt: new Date().toISOString() })
    .where(eq(schema.gardens.id, id));
}

export async function updateGarden(id: string, patch: Partial<Pick<Garden, "name" | "status">>): Promise<void> {
  await getDb()
    .update(schema.gardens)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(schema.gardens.id, id));
}

// SQLite only enforces ON DELETE CASCADE when the foreign_keys pragma is on, which isn't
// guaranteed over a stateless HTTP connection, so child rows are removed explicitly.
export async function deleteGarden(id: string): Promise<void> {
  const db = getDb();
  await deleteSharingFor([id]);
  await db.batch([
    db.delete(schema.taskStatus).where(eq(schema.taskStatus.gardenId, id)),
    db.delete(schema.journal).where(eq(schema.journal.gardenId, id)),
    db.delete(schema.gardens).where(eq(schema.gardens.id, id)),
  ]);
}

/** Remove a user and everything they own. */
export async function deleteUserData(userId: string): Promise<void> {
  const db = getDb();
  const owned = await db.select({ id: schema.gardens.id }).from(schema.gardens).where(eq(schema.gardens.ownerId, userId));
  const ids = owned.map((g) => g.id);
  await deleteSharingFor(ids, userId);
  if (ids.length) {
    await db.batch([
      db.delete(schema.taskStatus).where(inArray(schema.taskStatus.gardenId, ids)),
      db.delete(schema.journal).where(inArray(schema.journal.gardenId, ids)),
      db.delete(schema.gardens).where(inArray(schema.gardens.id, ids)),
    ]);
  }
  await db.batch([
    db.delete(schema.sessions).where(eq(schema.sessions.userId, userId)),
    db.delete(schema.users).where(eq(schema.users.id, userId)),
  ]);
}

export async function doneTaskIds(gardenIds: string[]): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  if (gardenIds.length === 0) return map;
  const rows = await getDb()
    .select()
    .from(schema.taskStatus)
    .where(inArray(schema.taskStatus.gardenId, gardenIds));
  for (const r of rows) {
    if (!map.has(r.gardenId)) map.set(r.gardenId, new Set());
    map.get(r.gardenId)!.add(r.taskId);
  }
  return map;
}

export async function setTaskDone(gardenId: string, taskId: string, done: boolean): Promise<void> {
  const db = getDb();
  if (done) {
    await db
      .insert(schema.taskStatus)
      .values({ gardenId, taskId, doneAt: new Date().toISOString() })
      .onConflictDoNothing();
  } else {
    await db
      .delete(schema.taskStatus)
      .where(and(eq(schema.taskStatus.gardenId, gardenId), eq(schema.taskStatus.taskId, taskId)));
  }
}

export async function listJournal(gardenId: string): Promise<JournalEntry[]> {
  return getDb()
    .select()
    .from(schema.journal)
    .where(eq(schema.journal.gardenId, gardenId))
    .orderBy(desc(schema.journal.date), desc(schema.journal.createdAt));
}

export async function addJournal(
  gardenId: string,
  entry: Omit<JournalEntry, "id" | "gardenId" | "createdAt">,
): Promise<JournalEntry> {
  const row = { ...entry, id: randomId(14), gardenId, createdAt: new Date().toISOString() };
  await getDb().insert(schema.journal).values(row);
  return row;
}

export async function deleteJournal(gardenId: string, id: string): Promise<void> {
  await getDb()
    .delete(schema.journal)
    .where(and(eq(schema.journal.gardenId, gardenId), eq(schema.journal.id, id)));
}
