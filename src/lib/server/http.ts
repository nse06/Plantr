import type { ZodType } from "zod";

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

/**
 * Defense in depth against cross-site requests: session cookies are SameSite=Lax already,
 * and mutating endpoints also require the Origin header (when present) to match the host.
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function parseJson<T>(req: Request, schema: ZodType<T>): Promise<{ data: T } | { response: Response }> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { response: error("Invalid JSON body") };
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    return { response: error(issue ? `${issue.path.join(".") || "body"}: ${issue.message}` : "Invalid request") };
  }
  return { data: result.data };
}
