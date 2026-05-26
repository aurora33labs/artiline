import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { db, schema } from "@/lib/db";

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30d, matches Auth.js default

/**
 * Whether Auth.js would use secure cookies. Mirrors @auth/core: secure when the
 * canonical URL is https. Drives the `__Secure-` cookie name prefix.
 */
function secureCookiesEnabled(): boolean {
  const url = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "";
  return url.startsWith("https://");
}

/** Exact session cookie name Auth.js reads (database strategy). */
export function sessionCookieName(): string {
  return `${secureCookiesEnabled() ? "__Secure-" : ""}authjs.session-token`;
}

/**
 * Create a database-strategy session row for a user. The raw sessionToken is
 * what Auth.js stores in the cookie and looks up via getSessionAndUser — no
 * encryption involved for database sessions.
 */
export async function createUserSession(
  userId: string,
): Promise<{ sessionToken: string; expires: Date }> {
  const sessionToken = randomUUID();
  const expires = new Date(Date.now() + SESSION_MAX_AGE_MS);
  await db.insert(schema.authSessions).values({ sessionToken, userId, expires });
  return { sessionToken, expires };
}

/**
 * Set the Auth.js session cookie with the same options @auth/core uses for the
 * sessionToken cookie, so `auth()` recognizes the session.
 */
export async function setSessionCookie(
  sessionToken: string,
  expires: Date,
): Promise<void> {
  const store = await cookies();
  store.set(sessionCookieName(), sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: secureCookiesEnabled(),
    expires,
  });
}
