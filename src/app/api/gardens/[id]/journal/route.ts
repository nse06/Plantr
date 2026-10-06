import { getCurrentUser } from "@/lib/server/auth";
import { addJournal, deleteJournal, getGarden } from "@/lib/server/gardens";
import { error, json, parseJson, sameOrigin } from "@/lib/server/http";
import { journalSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

async function owned(id: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  const garden = await getGarden(id);
  return garden && garden.ownerId === user.id ? garden : null;
}

export async function POST(req: Request, ctx: Ctx) {
  if (!sameOrigin(req)) return error("Forbidden", 403);
  const { id } = await ctx.params;
  const garden = await owned(id);
  if (!garden) return error("Garden not found.", 404);
  const parsed = await parseJson(req, journalSchema);
  if ("response" in parsed) return parsed.response;
  const d = parsed.data;
  if (d.kind === "harvest" && (!d.plantId || !garden.plan.plants.some((p) => p.plantId === d.plantId))) {
    return error("Pick a plant from your garden.");
  }
  if (d.kind === "note" && !d.note) return error("Write a note first.");
  const entry = await addJournal(id, {
    date: d.date,
    kind: d.kind,
    plantId: d.plantId ?? null,
    amount: d.amount ?? null,
    unit: d.unit ?? null,
    note: d.note ?? null,
  });
  return json({ entry });
}

export async function DELETE(req: Request, ctx: Ctx) {
  if (!sameOrigin(req)) return error("Forbidden", 403);
  const { id } = await ctx.params;
  const garden = await owned(id);
  if (!garden) return error("Garden not found.", 404);
  const entryId = new URL(req.url).searchParams.get("entry");
  if (!entryId) return error("Missing entry id.");
  await deleteJournal(id, entryId);
  return json({ ok: true });
}
