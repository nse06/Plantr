import { getCurrentUser } from "@/lib/server/auth";
import { error, json, sameOrigin } from "@/lib/server/http";
import { deletePhoto, photoForViewer } from "@/lib/server/social";

type Ctx = { params: Promise<{ id: string }> };

/** Serve a garden photo (?size=thumb for the small one) to anyone allowed to see it. */
export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const size = new URL(req.url).searchParams.get("size") === "thumb" ? "thumb" : "full";
  const photo = await photoForViewer(id, size, await getCurrentUser());
  if (!photo) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(photo.bytes), {
    headers: {
      "Content-Type": "image/jpeg",
      // Public photos can sit in shared caches for an hour, so moderation takes effect quickly.
      "Cache-Control": photo.isPublic ? "public, max-age=600, s-maxage=3600" : "private, max-age=600",
      "Content-Length": String(photo.bytes.length),
    },
  });
}

export async function DELETE(req: Request, ctx: Ctx) {
  if (!sameOrigin(req)) return error("Forbidden", 403);
  const user = await getCurrentUser();
  if (!user) return error("Sign in first.", 401);
  const { id } = await ctx.params;
  if (!(await deletePhoto(id, user))) return error("Photo not found.", 404);
  return json({ ok: true });
}
