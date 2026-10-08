import { describe, expect, it } from "vitest";
import type { Garden, User } from "@/db/schema";
import { buildClimate } from "@/lib/garden/climate";
import { buildPlan, planContext } from "@/lib/garden/plan";
import { designWithRules } from "@/lib/garden/recommend";
import type { PlanInput } from "@/lib/garden/types";
import { digestForGarden, renderDigest, unsubscribeUrl } from "./digest";
import { sign, verifySignature } from "./crypto";

function garden(today: string): Garden {
  const input: PlanInput = {
    zip: "20001",
    climate: buildClimate("20001", "7b", "DC", "estimate"),
    spaceType: "raised-bed",
    areas: [{ kind: "bed", id: "b", name: "Bed 1", widthFt: 4, lengthFt: 8, raised: true }],
    bedsReady: true,
    sun: "full",
    goals: ["salad"],
    wants: [],
    notes: "",
    household: 2,
    experience: "new",
    time: "moderate",
    season: "spring",
    year: 2027,
  };
  const { ctx, evaluation } = planContext(input, today);
  const plan = buildPlan(input, designWithRules(input, evaluation, ctx), today);
  return {
    id: "garden123",
    ownerId: "u1",
    guestId: null,
    name: "Salad garden 2027",
    status: "active",
    zip: "20001",
    zone: "7b",
    season: "spring",
    year: 2027,
    input,
    plan,
    photo: null,
    isPublic: false,
    publishedAt: null,
    hidden: false,
    createdAt: today,
    updatedAt: today,
  };
}

const user: User = {
  id: "u1",
  email: "a@example.com",
  digest: true,
  lastDigestAt: null,
  handle: null,
  displayName: null,
  bio: null,
  createdAt: "2026-10-01",
};

describe("weekly digest", () => {
  it("lists this week's tasks and skips quiet weeks", () => {
    const g = garden("2026-12-01");
    const firstTask = g.plan.tasks[0];
    const busy = digestForGarden(g, new Set(), firstTask.date);
    expect(busy.upcoming.length).toBeGreaterThan(0);
    const email = renderDigest(user, [busy]);
    expect(email?.subject).toMatch(/This week in your garden/);
    expect(email?.html).toContain(firstTask.title.replace(/'/g, "&#39;"));
    expect(email?.text).toContain("Unsubscribe");

    const quiet = digestForGarden(g, new Set(), "2026-12-01");
    expect(renderDigest(user, [quiet])).toBeNull();
  });

  it("doesn't nag about tasks already done", () => {
    const g = garden("2026-12-01");
    const day = g.plan.tasks[0].date;
    const due = g.plan.tasks.filter((t) => t.date >= day && t.date < "2099-01-01").slice(0, 50);
    const done = new Set(due.map((t) => t.id));
    expect(digestForGarden(g, done, day).upcoming).toHaveLength(0);
  });

  it("signs unsubscribe links so they can't be forged", () => {
    const url = new URL(unsubscribeUrl("u1"));
    expect(verifySignature("digest:u1", url.searchParams.get("sig")!)).toBe(true);
    expect(verifySignature("digest:u2", url.searchParams.get("sig")!)).toBe(false);
    expect(verifySignature("digest:u1", sign("digest:u1").slice(0, -1) + "x")).toBe(false);
  });
});
