import { destroySession } from "@/lib/server/auth";
import { sameOrigin } from "@/lib/server/http";

export async function POST(req: Request) {
  if (sameOrigin(req)) await destroySession();
  return Response.redirect(new URL("/", req.url), 303);
}
