import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Garden, User } from "@/db/schema";
import type { PlanInput } from "@/lib/garden/types";

// These tests run the real data layer against a throwaway SQLite database.

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "plantr-test-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.db")}`;
process.env.ADMIN_EMAILS = "admin@example.com";

type Social = typeof import("./social");
type Auth = typeof import("./auth");
type Gardens = typeof import("./gardens");
let social: Social;
let auth: Auth;
let gardens: Gardens;
let owner: User;
let fan: User;
let garden: Garden;

function segment(marker: number, payload: Buffer): Buffer {
  const len = payload.length + 2;
  return Buffer.concat([Buffer.from([0xff, marker, len >> 8, len & 0xff]), payload]);
}

/** A structurally valid JPEG with EXIF (fake GPS) and a comment, for metadata-stripping tests. */
function fakeJpeg(width: number, height: number): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segment(0xe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "binary")),
    segment(0xe1, Buffer.from("Exif\0\0GPSLatitude=40.7128,GPSLongitude=-74.0060", "binary")),
    segment(0xfe, Buffer.from("taken at 12 Main St")),
    segment(0xc0, Buffer.from([8, height >> 8, height & 0xff, width >> 8, width & 0xff, 1, 1, 0x11, 0])),
    segment(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])),
    Buffer.from([0x12, 0x34, 0x56, 0xff, 0xd9]),
  ]);
}

beforeAll(async () => {
  const { createClient } = await import("@libsql/client");
  const { drizzle } = await import("drizzle-orm/libsql");
  const { migrate } = await import("drizzle-orm/libsql/migrator");
  const client = createClient({ url: process.env.DATABASE_URL! });
  await migrate(drizzle(client), { migrationsFolder: path.resolve(__dirname, "../../../drizzle") });
  client.close();

  social = await import("./social");
  auth = await import("./auth");
  gardens = await import("./gardens");
  const { buildClimate } = await import("@/lib/garden/climate");
  const { planContext, buildPlan } = await import("@/lib/garden/plan");
  const { designWithRules } = await import("@/lib/garden/recommend");

  owner = await auth.findOrCreateUser("owner@example.com");
  fan = await auth.findOrCreateUser("fan@example.com");
  const input: PlanInput = {
    zip: "20001",
    climate: buildClimate("20001", "7b", "DC", "estimate"),
    spaceType: "raised-bed",
    areas: [{ kind: "bed", id: "b1", name: "Bed 1", widthFt: 4, lengthFt: 8, raised: true }],
    bedsReady: false,
    sun: "full",
    goals: ["salsa"],
    wants: [],
    notes: "",
    household: 2,
    experience: "new",
    time: "moderate",
    season: "spring",
    year: 2027,
  };
  const { ctx, evaluation } = planContext(input, "2026-10-08");
  const plan = buildPlan(input, designWithRules(input, evaluation, ctx), "2026-10-08");
  const draft = await gardens.insertGarden({ ownerId: owner.id, guestId: null, name: "Salsa garden 2027", input, plan, photo: null });
  await gardens.saveGarden(draft.id, owner.id);
  garden = (await gardens.getGarden(draft.id))!;
});

const reload = async () => (garden = (await gardens.getGarden(garden.id))!);

describe("sign-in codes", () => {
  it("signs in with the emailed code once, and uses up the link too", async () => {
    const { token, code } = await auth.createLoginToken("code@example.com", "/garden");
    expect(code).toMatch(/^\d{6}$/);
    const wrong = code === "000000" ? "111111" : "000000";
    expect(await auth.consumeLoginCode("code@example.com", wrong)).toBeNull();
    expect(await auth.consumeLoginCode("code@example.com", code)).toEqual({ email: "code@example.com", next: "/garden" });
    expect(await auth.consumeLoginCode("code@example.com", code)).toBeNull();
    expect(await auth.consumeLoginToken(token)).toBeNull();
  });

  it("stops accepting a code after five wrong guesses", async () => {
    const { code } = await auth.createLoginToken("guess@example.com", "/garden");
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) expect(await auth.consumeLoginCode("guess@example.com", wrong)).toBeNull();
    expect(await auth.consumeLoginCode("guess@example.com", code)).toBeNull();
  });
});

describe("profiles", () => {
  it("creates a friendly handle that isn't based on the email", async () => {
    const handle = await social.ensureHandle(owner);
    expect(handle).toMatch(/^[a-z]+-[a-z]+-\d+$/);
    expect(handle).not.toContain("owner");
    expect(await social.ensureHandle({ id: owner.id, handle: null })).toBe(handle);
  });

  it("validates and claims handles", async () => {
    expect(await social.updateProfile(owner.id, { handle: "a" })).toMatch(/3–24/);
    expect(await social.updateProfile(owner.id, { handle: "admin" })).toMatch(/reserved/);
    expect(await social.updateProfile(owner.id, { handle: "salsa-sam", displayName: "  Sam\u0007  ", bio: "Hot peppers." })).toBeNull();
    expect(await social.updateProfile(fan.id, { handle: "salsa-sam" })).toMatch(/taken/);
    const profile = await social.getProfile("salsa-sam");
    expect(profile).toMatchObject({ handle: "salsa-sam", displayName: "Sam", bio: "Hot peppers." });
  });
});

describe("shared gardens", () => {
  it("stays private until the owner shares it", async () => {
    expect(await social.getPublicGarden(garden, fan)).toBeNull();
    expect(await social.getPublicGarden(garden, null)).toBeNull();
    expect(await social.getPublicGarden(garden, owner)).not.toBeNull();
    expect((await social.listExplore()).map((c) => c.id)).not.toContain(garden.id);
  });

  it("shows up on the profile and in Explore once shared, without the ZIP code", async () => {
    await social.setGardenPublic(garden, owner, true);
    await reload();
    const view = await social.getPublicGarden(garden, null);
    expect(view?.location).toBe("DC · Zone 7b");
    const [card] = await social.listExplore();
    expect(card).toMatchObject({ id: garden.id, handle: "salsa-sam", ownerName: "Sam", location: "DC · Zone 7b" });
    expect(JSON.stringify(card)).not.toContain("20001");
    expect((await social.getProfile("salsa-sam"))?.gardens.map((g) => g.id)).toEqual([garden.id]);
  });
});

describe("photos", () => {
  let photoId = "";

  it("strips location metadata and reads the real size", async () => {
    const result = await social.addPhoto(garden, owner, fakeJpeg(1280, 960), fakeJpeg(480, 360), "First tomatoes!");
    expect("photo" in result).toBe(true);
    if (!("photo" in result)) return;
    photoId = result.photo.id;
    expect(result.photo).toMatchObject({ width: 1280, height: 960, caption: "First tomatoes!" });
    const served = await social.photoForViewer(photoId, "full", null);
    expect(served?.isPublic).toBe(true);
    const text = served!.bytes.toString("binary");
    expect(text).not.toContain("GPSLatitude");
    expect(text).not.toContain("Main St");
    expect(text).toContain("JFIF");
  });

  it("rejects files that aren't JPEGs, and other people's gardens", async () => {
    expect(await social.addPhoto(garden, owner, Buffer.from("not a jpeg"), fakeJpeg(10, 10), null)).toEqual({ error: "Upload a JPEG photo." });
    expect(await social.addPhoto(garden, fan, fakeJpeg(10, 10), fakeJpeg(10, 10), null)).toEqual({ error: "Garden not found." });
  });

  it("only shows photos of private gardens to their owner", async () => {
    await social.setGardenPublic(garden, owner, false);
    await reload();
    expect(await social.photoForViewer(photoId, "thumb", fan)).toBeNull();
    expect((await social.photoForViewer(photoId, "thumb", owner))?.isPublic).toBe(false);
    await social.setGardenPublic(garden, owner, true);
    await reload();
  });
});

describe("cheers and reports", () => {
  it("lets other people cheer a public garden, once", async () => {
    expect(await social.toggleCheer(garden, fan)).toEqual({ cheered: true, count: 1 });
    expect(await social.toggleCheer(garden, fan)).toEqual({ cheered: false, count: 0 });
    expect(await social.toggleCheer(garden, owner)).toBeNull();
  });

  it("hides a garden after three distinct reports until an admin keeps it", async () => {
    expect(await social.reportContent("garden", garden.id, "ip:a", "spam")).toBe(true);
    expect(await social.reportContent("garden", garden.id, "ip:a", "spam")).toBe(true);
    expect(await social.reportContent("garden", garden.id, "ip:b", "inappropriate")).toBe(true);
    await reload();
    expect(garden.hidden).toBe(false);
    await social.reportContent("garden", garden.id, fan.id, "other");
    await reload();
    expect(garden.hidden).toBe(true);
    expect((await social.listExplore()).map((c) => c.id)).not.toContain(garden.id);

    const [open] = await social.openReports();
    expect(open).toMatchObject({ type: "garden", id: garden.id, count: 3, hidden: true });
    await social.resolveReports("garden", garden.id, "keep");
    await reload();
    expect(garden.hidden).toBe(false);
    expect(await social.openReports()).toEqual([]);
    expect(social.isAdmin({ email: "Admin@Example.com" })).toBe(true);
    expect(social.isAdmin(fan)).toBe(false);
  });
});

describe("deleting an account", () => {
  it("removes the user's gardens, photos and cheers", async () => {
    await social.toggleCheer(garden, fan);
    await gardens.deleteUserData(owner.id);
    expect(await gardens.getGarden(garden.id)).toBeNull();
    expect(await social.listPhotos(garden.id, true)).toEqual([]);
    expect(await social.getProfile("salsa-sam")).toBeNull();
  });
});
