import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { destroySession, getCurrentUser } from "@/lib/server/auth";
import { deleteUserData } from "@/lib/server/gardens";
import { error, json, parseJson, sameOrigin } from "@/lib/server/http";

const patchSchema = z.object({ digest: z.boolean() });

export async function PATCH(req: Request) {
  if (!sameOrigin(req)) return error("Forbidden", 403);
  const user = await getCurrentUser();
  if (!user) return error("Sign in first.", 401);
  const parsed = await parseJson(req, patchSchema);
  if ("response" in parsed) return parsed.response;
  await getDb().update(schema.users).set({ digest: parsed.data.digest }).where(eq(schema.users.id, user.id));
  return json({ ok: true });
}

/** Delete the account and everything in it: gardens, task history, journal and sessions. */
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return error("Forbidden", 403);
  const user = await getCurrentUser();
  if (!user) return error("Sign in first.", 401);
  await destroySession();
  await deleteUserData(user.id);
  return json({ ok: true });
}
