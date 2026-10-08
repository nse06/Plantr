import { randomInt } from "node:crypto";
import { cookies } from "next/headers";
import { and, desc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { User } from "@/db/schema";
import { randomId, randomToken, sha256, sign, verifySignature } from "./crypto";

// Passwordless email sign-in. Session tokens are random and stored hashed, so a database
// leak can't be replayed into live sessions.

export const SESSION_COOKIE = "plantr_session";
export const GUEST_COOKIE = "plantr_guest";
const SESSION_DAYS = 60;
const LOGIN_TOKEN_MINUTES = 30;
/** Wrong guesses allowed per emailed code. */
const CODE_ATTEMPTS = 5;

const secure = process.env.NODE_ENV === "production";

export async function getCurrentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = getDb();
  const rows = await db
    .select({ user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(and(eq(schema.sessions.id, sha256(token)), gt(schema.sessions.expiresAt, Date.now())))
    .limit(1);
  return rows[0]?.user ?? null;
}

export async function getGuestId(): Promise<string | null> {
  return (await cookies()).get(GUEST_COOKIE)?.value ?? null;
}

/** Route handlers / server actions only: returns the guest id, creating the cookie if needed. */
export async function ensureGuestId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(GUEST_COOKIE)?.value;
  if (existing && /^[A-Za-z0-9]{16,40}$/.test(existing)) return existing;
  const id = randomId(24);
  store.set(GUEST_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return id;
}

export async function createSession(userId: string): Promise<void> {
  const token = randomToken();
  const now = Date.now();
  const expiresAt = now + SESSION_DAYS * 86_400_000;
  await getDb().insert(schema.sessions).values({ id: sha256(token), userId, expiresAt, createdAt: now });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await getDb().delete(schema.sessions).where(eq(schema.sessions.id, sha256(token)));
  store.delete(SESSION_COOKIE);
}

export function normalizeEmail(email: string): string | null {
  const e = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254 ? e : null;
}

/** Only allow redirects back into the app. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/garden";
  return next;
}

const codeKey = (email: string, code: string) => `login-code:${email}:${code}`;

/**
 * A sign-in email carries two ways in: a one-time link, and a 6-digit code for when the link
 * would open somewhere else (an iPhone home-screen app keeps its own cookies apart from
 * Safari, so a link from Mail signs in Safari, not the app).
 */
export async function createLoginToken(email: string, next: string): Promise<{ token: string; code: string }> {
  const token = randomToken();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const now = Date.now();
  const db = getDb();
  // Housekeeping: expired tokens are useless.
  await db.delete(schema.loginTokens).where(lt(schema.loginTokens.expiresAt, now));
  await db.insert(schema.loginTokens).values({
    tokenHash: sha256(token),
    email,
    next,
    codeHash: sign(codeKey(email, code)),
    expiresAt: now + LOGIN_TOKEN_MINUTES * 60_000,
    createdAt: now,
  });
  return { token, code };
}

/**
 * Sign in with the 6-digit code from a recent sign-in email. Each code allows a few wrong
 * guesses before it stops working; using it also uses up the email's link.
 */
export async function consumeLoginCode(email: string, code: string): Promise<{ email: string; next: string } | null> {
  const db = getDb();
  const now = Date.now();
  const t = schema.loginTokens;
  const rows = await db
    .select()
    .from(t)
    .where(and(eq(t.email, email), isNull(t.usedAt), gt(t.expiresAt, now), lt(t.attempts, CODE_ATTEMPTS)))
    .orderBy(desc(t.createdAt))
    .limit(5);
  const match = rows.find((r) => r.codeHash && verifySignature(codeKey(email, code), r.codeHash));
  if (!match) {
    if (rows.length) {
      await db
        .update(t)
        .set({ attempts: sql`${t.attempts} + 1` })
        .where(inArray(t.tokenHash, rows.map((r) => r.tokenHash)));
    }
    return null;
  }
  const updated = await db
    .update(t)
    .set({ usedAt: now })
    .where(and(eq(t.tokenHash, match.tokenHash), isNull(t.usedAt)))
    .returning();
  return updated[0] ? { email, next: safeNext(updated[0].next) } : null;
}

/** Consume a magic-link token. Returns the email and redirect target, or null if invalid. */
export async function consumeLoginToken(token: string): Promise<{ email: string; next: string } | null> {
  const db = getDb();
  const hash = sha256(token);
  const now = Date.now();
  const updated = await db
    .update(schema.loginTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(schema.loginTokens.tokenHash, hash),
        isNull(schema.loginTokens.usedAt),
        gt(schema.loginTokens.expiresAt, now),
      ),
    )
    .returning();
  const row = updated[0];
  return row ? { email: row.email, next: safeNext(row.next) } : null;
}

export async function findOrCreateUser(email: string): Promise<User> {
  const db = getDb();
  const existing = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (existing[0]) return existing[0];
  const user = { id: randomId(16), email, digest: true, lastDigestAt: null, createdAt: new Date().toISOString() };
  await db.insert(schema.users).values(user).onConflictDoNothing();
  const rows = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  return rows[0];
}
