import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { verifySignature } from "@/lib/server/crypto";

// One-click unsubscribe from the weekly email. Works without signing in (signed link),
// and supports RFC 8058 one-click POSTs from mail clients.

async function unsubscribe(req: Request): Promise<boolean> {
  const url = new URL(req.url);
  const userId = url.searchParams.get("u") ?? "";
  const sig = url.searchParams.get("sig") ?? "";
  if (!userId || !sig || !verifySignature(`digest:${userId}`, sig)) return false;
  await getDb().update(schema.users).set({ digest: false }).where(eq(schema.users.id, userId));
  return true;
}

export async function GET(req: Request) {
  const ok = await unsubscribe(req);
  return Response.redirect(new URL(ok ? "/unsubscribed" : "/unsubscribed?error=1", req.url), 303);
}

export async function POST(req: Request) {
  const ok = await unsubscribe(req);
  return new Response(null, { status: ok ? 200 : 400 });
}
