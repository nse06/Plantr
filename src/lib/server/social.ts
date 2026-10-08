import { randomInt } from "node:crypto";
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Garden, User } from "@/db/schema";
import type { PlannedPlant } from "@/lib/garden/types";
import { seasonLabel } from "@/lib/garden/progress";
import type { GardenCard, PhotoMeta, ReportReason } from "@/lib/sharing";
import { randomId } from "./crypto";
import { cleanJpeg } from "./jpeg";

export type { GardenCard, PhotoMeta, ReportReason } from "@/lib/sharing";

// Sharing: public profiles, gardens shown on them, photo updates, cheers and reports.
// Everything is opt-in, and public pages never show a ZIP code (only the state and zone).

export const PHOTOS_PER_GARDEN = 60;
/** Distinct reports that hide a garden or photo until an admin looks at it. */
export const AUTO_HIDE_REPORTS = 3;
const MAX_IMAGE_BYTES = 700_000;
const MAX_THUMB_BYTES = 180_000;
const MAX_IMAGE_SIDE = 2400;

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

const RESERVED = new Set([
  "admin", "api", "app", "plantr", "explore", "settings", "account", "login", "logout", "signin", "signup",
  "garden", "gardens", "plan", "plans", "privacy", "terms", "support", "help", "about", "me", "root",
  "system", "moderator", "mod", "staff", "team", "official", "null", "undefined",
]);

/** Why a handle can't be used, or null if it's fine. */
export function handleProblem(handle: string): string | null {
  if (!/^[a-z0-9](?:[a-z0-9-]{1,22}[a-z0-9])$/.test(handle) || handle.includes("--")) {
    return "Use 3–24 lowercase letters, numbers or single hyphens.";
  }
  if (RESERVED.has(handle)) return "That name is reserved. Try another.";
  return null;
}

/** Trim, drop control characters and collapse whitespace. */
export function cleanText(value: string | null | undefined, max: number): string {
  return (value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

const ADJECTIVES = ["sunny", "leafy", "happy", "dewy", "breezy", "golden", "mossy", "rosy", "minty", "zesty", "cozy", "lucky"];
const NOUNS = ["basil", "tomato", "sprout", "radish", "pepper", "clover", "thyme", "sage", "pea", "bean", "fern", "carrot"];

function suggestHandle(): string {
  return `${ADJECTIVES[randomInt(ADJECTIVES.length)]}-${NOUNS[randomInt(NOUNS.length)]}-${randomInt(10, 1000)}`;
}

/** The user's profile handle, creating a friendly random one (never derived from their email) the first time. */
export async function ensureHandle(user: Pick<User, "id" | "handle">): Promise<string> {
  if (user.handle) return user.handle;
  const db = getDb();
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const rows = await db
        .update(schema.users)
        .set({ handle: suggestHandle() })
        .where(and(eq(schema.users.id, user.id), isNull(schema.users.handle)))
        .returning({ handle: schema.users.handle });
      if (rows[0]?.handle) return rows[0].handle;
      const [current] = await db.select({ handle: schema.users.handle }).from(schema.users).where(eq(schema.users.id, user.id)).limit(1);
      if (current?.handle) return current.handle;
    } catch {
      // Someone already has that handle: try another.
    }
  }
  throw new Error("Couldn't create a profile name.");
}

/** Returns an error message, or null when saved. */
export async function updateProfile(
  userId: string,
  patch: { handle?: string; displayName?: string | null; bio?: string | null },
): Promise<string | null> {
  const db = getDb();
  const set: { handle?: string; displayName?: string | null; bio?: string | null } = {};
  if (patch.handle !== undefined) {
    const handle = patch.handle.trim().toLowerCase();
    const problem = handleProblem(handle);
    if (problem) return problem;
    const [taken] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.handle, handle), ne(schema.users.id, userId)))
      .limit(1);
    if (taken) return "That name is taken. Try another.";
    set.handle = handle;
  }
  if (patch.displayName !== undefined) set.displayName = cleanText(patch.displayName, 40) || null;
  if (patch.bio !== undefined) set.bio = cleanText(patch.bio, 200) || null;
  if (Object.keys(set).length === 0) return null;
  try {
    await db.update(schema.users).set(set).where(eq(schema.users.id, userId));
  } catch {
    return "That name is taken. Try another.";
  }
  return null;
}

/** Admins (ADMIN_EMAILS, comma-separated) can review reports and remove content. */
export function isAdmin(user: Pick<User, "email"> | null): boolean {
  if (!user) return false;
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(user.email.toLowerCase());
}

// ---------------------------------------------------------------------------
// Public gardens
// ---------------------------------------------------------------------------

/** "NY · Zone 7b" or "Indoors · NY". Never the ZIP code. */
export function locationLabel(spaceType: string, state: string | null, zone: string): string {
  if (spaceType === "indoor") return state ? `Indoors · ${state}` : "Indoors";
  return state ? `${state} · Zone ${zone}` : `Zone ${zone}`;
}

/** Shared by its owner, saved, and not hidden by moderation. */
export function isPubliclyVisible(g: Pick<Garden, "isPublic" | "hidden" | "status" | "ownerId">): boolean {
  return g.isPublic && !g.hidden && g.status !== "draft" && Boolean(g.ownerId);
}

// Cards read a few fields out of the plan JSON instead of loading whole plans.
const cardFields = {
  id: schema.gardens.id,
  name: schema.gardens.name,
  season: schema.gardens.season,
  year: schema.gardens.year,
  zone: schema.gardens.zone,
  updatedAt: schema.gardens.updatedAt,
  state: sql<string | null>`json_extract(${schema.gardens.input}, '$.climate.state')`,
  spaceType: sql<string>`json_extract(${schema.gardens.input}, '$.spaceType')`,
  plants: sql<string>`json_extract(${schema.gardens.plan}, '$.plants')`,
  plantCount: sql<number>`json_extract(${schema.gardens.plan}, '$.stats.plantCount')`,
  handle: schema.users.handle,
  displayName: schema.users.displayName,
};

const visibleGarden = and(
  eq(schema.gardens.isPublic, true),
  eq(schema.gardens.hidden, false),
  ne(schema.gardens.status, "draft"),
  isNotNull(schema.users.handle),
);

async function cardsWhere(where: SQL | undefined, limit: number, offset = 0): Promise<GardenCard[]> {
  const db = getDb();
  const rows = await db
    .select(cardFields)
    .from(schema.gardens)
    .innerJoin(schema.users, eq(schema.gardens.ownerId, schema.users.id))
    .where(and(visibleGarden, where))
    .orderBy(desc(schema.gardens.updatedAt))
    .limit(limit)
    .offset(offset);
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return [];
  const [photos, cheerRows] = await Promise.all([
    db
      .select({ id: schema.gardenPhotos.id, gardenId: schema.gardenPhotos.gardenId })
      .from(schema.gardenPhotos)
      .where(and(inArray(schema.gardenPhotos.gardenId, ids), eq(schema.gardenPhotos.hidden, false)))
      .orderBy(desc(schema.gardenPhotos.createdAt)),
    db
      .select({ gardenId: schema.cheers.gardenId, n: sql<number>`count(*)` })
      .from(schema.cheers)
      .where(inArray(schema.cheers.gardenId, ids))
      .groupBy(schema.cheers.gardenId),
  ]);
  const cover = new Map<string, string>();
  const photoCount = new Map<string, number>();
  for (const p of photos) {
    if (!cover.has(p.gardenId)) cover.set(p.gardenId, p.id);
    photoCount.set(p.gardenId, (photoCount.get(p.gardenId) ?? 0) + 1);
  }
  const cheerCount = new Map(cheerRows.map((c) => [c.gardenId, Number(c.n)]));
  return rows.map((r) => {
    const plants = (JSON.parse(r.plants || "[]") as PlannedPlant[]).map((p) => ({ plantId: p.plantId, emoji: p.emoji, name: p.name }));
    return {
      id: r.id,
      name: r.name,
      handle: r.handle ?? "",
      ownerName: r.displayName || r.handle || "A gardener",
      location: locationLabel(r.spaceType, r.state, r.zone),
      season: seasonLabel({ season: r.season, year: r.year }),
      crops: plants,
      plantCount: Number(r.plantCount ?? 0),
      coverPhotoId: cover.get(r.id) ?? null,
      photoCount: photoCount.get(r.id) ?? 0,
      cheers: cheerCount.get(r.id) ?? 0,
      updatedAt: r.updatedAt,
    };
  });
}

/** Recently active public gardens, newest first. */
export function listExplore(limit = 24, offset = 0): Promise<GardenCard[]> {
  return cardsWhere(undefined, limit, offset);
}

export interface PublicProfile {
  id: string;
  handle: string;
  displayName: string | null;
  bio: string | null;
  memberSince: string;
  gardens: GardenCard[];
}

export async function getProfile(handle: string): Promise<PublicProfile | null> {
  if (!/^[a-z0-9-]{3,24}$/.test(handle)) return null;
  const [user] = await getDb().select().from(schema.users).where(eq(schema.users.handle, handle)).limit(1);
  if (!user?.handle) return null;
  return {
    id: user.id,
    handle: user.handle,
    displayName: user.displayName,
    bio: user.bio,
    memberSince: user.createdAt,
    gardens: await cardsWhere(eq(schema.gardens.ownerId, user.id), 60),
  };
}

const photoMetaFields = {
  id: schema.gardenPhotos.id,
  caption: schema.gardenPhotos.caption,
  width: schema.gardenPhotos.width,
  height: schema.gardenPhotos.height,
  createdAt: schema.gardenPhotos.createdAt,
  hidden: schema.gardenPhotos.hidden,
};

/** A garden's photos, newest first. Hidden ones only for the owner (and admins). */
export async function listPhotos(gardenId: string, includeHidden: boolean): Promise<PhotoMeta[]> {
  return getDb()
    .select(photoMetaFields)
    .from(schema.gardenPhotos)
    .where(and(eq(schema.gardenPhotos.gardenId, gardenId), includeHidden ? undefined : eq(schema.gardenPhotos.hidden, false)))
    .orderBy(desc(schema.gardenPhotos.createdAt));
}

export interface PublicGarden {
  garden: Garden;
  handle: string;
  ownerName: string;
  location: string;
  photos: PhotoMeta[];
  cheers: number;
  cheered: boolean;
  isOwner: boolean;
  tasksDone: number;
  harvests: number;
}

/** A garden as the public sees it, or null when the viewer isn't allowed to see it. */
export async function getPublicGarden(garden: Garden, viewer: User | null): Promise<PublicGarden | null> {
  const isOwner = Boolean(viewer && garden.ownerId === viewer.id);
  const admin = isAdmin(viewer);
  if (!isPubliclyVisible(garden) && !isOwner && !admin) return null;
  if (!garden.ownerId) return null;
  const db = getDb();
  const [[owner], photos, [cheerRow], cheeredRows, [done], [harvest]] = await Promise.all([
    db.select({ handle: schema.users.handle, displayName: schema.users.displayName }).from(schema.users).where(eq(schema.users.id, garden.ownerId)).limit(1),
    listPhotos(garden.id, isOwner || admin),
    db.select({ n: sql<number>`count(*)` }).from(schema.cheers).where(eq(schema.cheers.gardenId, garden.id)),
    viewer
      ? db.select({ userId: schema.cheers.userId }).from(schema.cheers).where(and(eq(schema.cheers.gardenId, garden.id), eq(schema.cheers.userId, viewer.id))).limit(1)
      : Promise.resolve([]),
    db.select({ n: sql<number>`count(*)` }).from(schema.taskStatus).where(eq(schema.taskStatus.gardenId, garden.id)),
    db
      .select({ n: sql<number>`count(*)` })
      .from(schema.journal)
      .where(and(eq(schema.journal.gardenId, garden.id), eq(schema.journal.kind, "harvest"))),
  ]);
  return {
    garden,
    handle: owner?.handle ?? "",
    ownerName: owner?.displayName || owner?.handle || "A gardener",
    location: locationLabel(garden.input.spaceType, garden.input.climate.state, garden.input.climate.zone),
    photos,
    cheers: Number(cheerRow?.n ?? 0),
    cheered: cheeredRows.length > 0,
    isOwner,
    tasksDone: Number(done?.n ?? 0),
    harvests: Number(harvest?.n ?? 0),
  };
}

/** Show (or stop showing) a garden on the owner's profile and in Explore. */
export async function setGardenPublic(garden: Garden, user: User, isPublic: boolean): Promise<{ handle: string }> {
  const handle = await ensureHandle(user);
  const now = new Date().toISOString();
  await getDb()
    .update(schema.gardens)
    .set({ isPublic, publishedAt: isPublic ? (garden.publishedAt ?? now) : garden.publishedAt, updatedAt: now })
    .where(eq(schema.gardens.id, garden.id));
  return { handle };
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

export async function addPhoto(
  garden: Garden,
  user: User,
  imageBytes: Buffer,
  thumbBytes: Buffer,
  caption: string | null,
): Promise<{ photo: PhotoMeta } | { error: string }> {
  if (garden.ownerId !== user.id) return { error: "Garden not found." };
  if (imageBytes.length > MAX_IMAGE_BYTES || thumbBytes.length > MAX_THUMB_BYTES) return { error: "That photo is too large." };
  const image = cleanJpeg(imageBytes);
  const thumb = cleanJpeg(thumbBytes);
  if (!image || !thumb) return { error: "Upload a JPEG photo." };
  if (image.width > MAX_IMAGE_SIDE || image.height > MAX_IMAGE_SIDE) return { error: "That photo is too large." };
  const db = getDb();
  const [count] = await db.select({ n: sql<number>`count(*)` }).from(schema.gardenPhotos).where(eq(schema.gardenPhotos.gardenId, garden.id));
  if (Number(count?.n ?? 0) >= PHOTOS_PER_GARDEN) {
    return { error: `A garden can hold ${PHOTOS_PER_GARDEN} photos. Delete a few to add more.` };
  }
  const now = new Date().toISOString();
  const row = {
    id: randomId(16),
    gardenId: garden.id,
    userId: user.id,
    image: image.data,
    thumb: thumb.data,
    width: image.width,
    height: image.height,
    caption: cleanText(caption, 200) || null,
    hidden: false,
    createdAt: now,
  };
  await db.batch([
    db.insert(schema.gardenPhotos).values(row),
    // Fresh photos bring a garden back to the top of Explore.
    db.update(schema.gardens).set({ updatedAt: now }).where(eq(schema.gardens.id, garden.id)),
  ]);
  return { photo: { id: row.id, caption: row.caption, width: row.width, height: row.height, createdAt: now, hidden: false } };
}

/** The photo's owner (or an admin) can delete it. */
export async function deletePhoto(photoId: string, user: User): Promise<boolean> {
  const db = getDb();
  const [photo] = await db.select({ userId: schema.gardenPhotos.userId }).from(schema.gardenPhotos).where(eq(schema.gardenPhotos.id, photoId)).limit(1);
  if (!photo || (photo.userId !== user.id && !isAdmin(user))) return false;
  await db.batch([
    db.delete(schema.reports).where(and(eq(schema.reports.targetType, "photo"), eq(schema.reports.targetId, photoId))),
    db.delete(schema.gardenPhotos).where(eq(schema.gardenPhotos.id, photoId)),
  ]);
  return true;
}

/** Photo bytes, if this viewer may see them. `isPublic` decides how long caches may keep them. */
export async function photoForViewer(
  photoId: string,
  size: "full" | "thumb",
  viewer: User | null,
): Promise<{ bytes: Buffer; isPublic: boolean } | null> {
  if (!/^[A-Za-z0-9]{8,32}$/.test(photoId)) return null;
  const [row] = await getDb()
    .select({
      bytes: size === "thumb" ? schema.gardenPhotos.thumb : schema.gardenPhotos.image,
      photoHidden: schema.gardenPhotos.hidden,
      isPublic: schema.gardens.isPublic,
      hidden: schema.gardens.hidden,
      status: schema.gardens.status,
      ownerId: schema.gardens.ownerId,
    })
    .from(schema.gardenPhotos)
    .innerJoin(schema.gardens, eq(schema.gardenPhotos.gardenId, schema.gardens.id))
    .where(eq(schema.gardenPhotos.id, photoId))
    .limit(1);
  if (!row) return null;
  if (isPubliclyVisible(row) && !row.photoHidden) return { bytes: row.bytes, isPublic: true };
  if (viewer && (viewer.id === row.ownerId || isAdmin(viewer))) return { bytes: row.bytes, isPublic: false };
  return null;
}

// ---------------------------------------------------------------------------
// Cheers
// ---------------------------------------------------------------------------

/** Cheer (or un-cheer) someone else's public garden. */
export async function toggleCheer(garden: Garden, user: User): Promise<{ cheered: boolean; count: number } | null> {
  if (!isPubliclyVisible(garden) || garden.ownerId === user.id) return null;
  const db = getDb();
  const where = and(eq(schema.cheers.gardenId, garden.id), eq(schema.cheers.userId, user.id));
  const [existing] = await db.select({ userId: schema.cheers.userId }).from(schema.cheers).where(where).limit(1);
  if (existing) await db.delete(schema.cheers).where(where);
  else await db.insert(schema.cheers).values({ gardenId: garden.id, userId: user.id, createdAt: new Date().toISOString() }).onConflictDoNothing();
  const [count] = await db.select({ n: sql<number>`count(*)` }).from(schema.cheers).where(eq(schema.cheers.gardenId, garden.id));
  return { cheered: !existing, count: Number(count?.n ?? 0) };
}

// ---------------------------------------------------------------------------
// Reports and moderation
// ---------------------------------------------------------------------------

type Target = "garden" | "photo";

async function targetIsPublic(type: Target, id: string): Promise<boolean> {
  const db = getDb();
  if (type === "garden") {
    const [g] = await db
      .select({ isPublic: schema.gardens.isPublic, hidden: schema.gardens.hidden, status: schema.gardens.status, ownerId: schema.gardens.ownerId })
      .from(schema.gardens)
      .where(eq(schema.gardens.id, id))
      .limit(1);
    return Boolean(g && isPubliclyVisible(g));
  }
  const [p] = await db
    .select({ photoHidden: schema.gardenPhotos.hidden, isPublic: schema.gardens.isPublic, hidden: schema.gardens.hidden, status: schema.gardens.status, ownerId: schema.gardens.ownerId })
    .from(schema.gardenPhotos)
    .innerJoin(schema.gardens, eq(schema.gardenPhotos.gardenId, schema.gardens.id))
    .where(eq(schema.gardenPhotos.id, id))
    .limit(1);
  return Boolean(p && !p.photoHidden && isPubliclyVisible(p));
}

async function setHidden(type: Target, id: string, hidden: boolean): Promise<void> {
  const db = getDb();
  if (type === "garden") await db.update(schema.gardens).set({ hidden }).where(eq(schema.gardens.id, id));
  else await db.update(schema.gardenPhotos).set({ hidden }).where(eq(schema.gardenPhotos.id, id));
}

/**
 * Report public content. Each person counts once per item; enough distinct reports hide it
 * until an admin reviews it. Returns false when there's nothing public to report.
 */
export async function reportContent(type: Target, id: string, reporterKey: string, reason: ReportReason): Promise<boolean> {
  if (!(await targetIsPublic(type, id))) return false;
  const db = getDb();
  await db
    .insert(schema.reports)
    .values({ targetType: type, targetId: id, reporterKey, reason, createdAt: new Date().toISOString() })
    .onConflictDoNothing();
  const [open] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.reports)
    .where(and(eq(schema.reports.targetType, type), eq(schema.reports.targetId, id), isNull(schema.reports.resolvedAt)));
  if (Number(open?.n ?? 0) >= AUTO_HIDE_REPORTS) await setHidden(type, id, true);
  return true;
}

export interface OpenReport {
  type: Target;
  id: string;
  count: number;
  reasons: string[];
  firstAt: string;
  hidden: boolean;
  gardenId: string | null;
  label: string;
}

export async function openReports(): Promise<OpenReport[]> {
  const db = getDb();
  const rows = await db
    .select({
      type: schema.reports.targetType,
      id: schema.reports.targetId,
      count: sql<number>`count(*)`,
      reasons: sql<string>`group_concat(${schema.reports.reason})`,
      firstAt: sql<string>`min(${schema.reports.createdAt})`,
    })
    .from(schema.reports)
    .where(isNull(schema.reports.resolvedAt))
    .groupBy(schema.reports.targetType, schema.reports.targetId)
    .orderBy(asc(sql`min(${schema.reports.createdAt})`));
  const out: OpenReport[] = [];
  for (const r of rows) {
    let hidden = false;
    let gardenId: string | null = null;
    let label = "(deleted)";
    if (r.type === "garden") {
      const [g] = await db.select({ name: schema.gardens.name, hidden: schema.gardens.hidden }).from(schema.gardens).where(eq(schema.gardens.id, r.id)).limit(1);
      if (g) {
        hidden = g.hidden;
        gardenId = r.id;
        label = g.name;
      }
    } else {
      const [p] = await db
        .select({ caption: schema.gardenPhotos.caption, hidden: schema.gardenPhotos.hidden, gardenId: schema.gardenPhotos.gardenId })
        .from(schema.gardenPhotos)
        .where(eq(schema.gardenPhotos.id, r.id))
        .limit(1);
      if (p) {
        hidden = p.hidden;
        gardenId = p.gardenId;
        label = p.caption || "Photo";
      }
    }
    out.push({ type: r.type, id: r.id, count: Number(r.count), reasons: [...new Set((r.reasons ?? "").split(","))], firstAt: r.firstAt, hidden, gardenId, label });
  }
  return out;
}

/** "keep": restore it and close the reports. "remove": delete the photo, or take the garden off public view. */
export async function resolveReports(type: Target, id: string, action: "keep" | "remove"): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  const close = db
    .update(schema.reports)
    .set({ resolvedAt: now })
    .where(and(eq(schema.reports.targetType, type), eq(schema.reports.targetId, id), isNull(schema.reports.resolvedAt)));
  if (action === "keep") {
    await setHidden(type, id, false);
    await close;
  } else if (type === "photo") {
    await db.batch([close, db.delete(schema.gardenPhotos).where(eq(schema.gardenPhotos.id, id))]);
  } else {
    // The owner keeps their garden; it just stays off public pages.
    await db.batch([close, db.update(schema.gardens).set({ hidden: true, isPublic: false }).where(eq(schema.gardens.id, id))]);
  }
}

/** Child rows of gardens that are being deleted (SQLite cascades aren't guaranteed over HTTP). */
export async function deleteSharingFor(gardenIds: string[], userId?: string): Promise<void> {
  const db = getDb();
  const photoIds = gardenIds.length
    ? (await db.select({ id: schema.gardenPhotos.id }).from(schema.gardenPhotos).where(inArray(schema.gardenPhotos.gardenId, gardenIds))).map((p) => p.id)
    : [];
  const statements = [];
  if (gardenIds.length) {
    statements.push(
      db.delete(schema.reports).where(and(eq(schema.reports.targetType, "garden"), inArray(schema.reports.targetId, gardenIds))),
      db.delete(schema.cheers).where(inArray(schema.cheers.gardenId, gardenIds)),
      db.delete(schema.gardenPhotos).where(inArray(schema.gardenPhotos.gardenId, gardenIds)),
    );
  }
  if (photoIds.length) {
    statements.push(db.delete(schema.reports).where(and(eq(schema.reports.targetType, "photo"), inArray(schema.reports.targetId, photoIds))));
  }
  if (userId) {
    statements.push(
      db.delete(schema.cheers).where(eq(schema.cheers.userId, userId)),
      db.delete(schema.reports).where(eq(schema.reports.reporterKey, userId)),
      db.delete(schema.gardenPhotos).where(eq(schema.gardenPhotos.userId, userId)),
    );
  }
  if (statements.length) await db.batch(statements as [(typeof statements)[number], ...(typeof statements)[number][]]);
}
