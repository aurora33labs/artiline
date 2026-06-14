import "server-only";
import { and, count, eq, gte, inArray, lt } from "drizzle-orm";
import { headers } from "next/headers";
import { db, schema } from "@/lib/db";

/**
 * Database-backed throttle for password auth (login + invite-accept). Failed
 * attempts are logged in `auth_attempts`, keyed by email / ip / invite-token; a
 * sliding-window count drives a temporary cooldown. Deliberately simple and
 * dependency-free so a self-hosted single-Postgres instance needs no Redis.
 *
 * Design guardrails (see why these matter):
 * - Cooldowns are ALWAYS temporary (the window), never a permanent lock — an
 *   admin can never brick themselves; worst case is a short wait. Magic-link
 *   sign-in is a separate, ungated path, so it stays as a recovery door.
 * - Fail-OPEN: any error checking the limit lets the request through. A DB hiccup
 *   must never lock everyone out (availability > strictness here).
 * - Toggle off instantly with AUTH_RATELIMIT=off.
 */

export type Bucket = { key: string; kind: string; limit: number; windowMin: number };

const PRUNE_AFTER_MS = 24 * 60 * 60 * 1000; // keep the table tiny

function enabled(): boolean {
  return process.env.AUTH_RATELIMIT !== "off";
}

/**
 * Client IP from the proxy's forwarded header. Artiline always runs behind a
 * reverse proxy (Railway/Nginx), so the left-most X-Forwarded-For entry is the
 * real client. Never key off the socket/proxy address — that would put every
 * user in one bucket and let one attacker lock the whole instance out.
 */
export async function getClientIp(): Promise<string | null> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip")?.trim() || null;
}

/**
 * True when ANY bucket is over its limit within its window. Fail-open: returns
 * `{ limited: false }` on toggle-off or any error.
 */
export async function isRateLimited(
  buckets: Bucket[],
): Promise<{ limited: boolean; retryAfterMin: number }> {
  if (!enabled() || buckets.length === 0) return { limited: false, retryAfterMin: 0 };
  try {
    let retryAfterMin = 0;
    for (const b of buckets) {
      const since = new Date(Date.now() - b.windowMin * 60_000);
      const [row] = await db
        .select({ n: count() })
        .from(schema.authAttempts)
        .where(
          and(
            eq(schema.authAttempts.key, b.key),
            eq(schema.authAttempts.kind, b.kind),
            gte(schema.authAttempts.createdAt, since),
          ),
        );
      if ((row?.n ?? 0) >= b.limit) retryAfterMin = Math.max(retryAfterMin, b.windowMin);
    }
    return { limited: retryAfterMin > 0, retryAfterMin };
  } catch {
    return { limited: false, retryAfterMin: 0 };
  }
}

/** Log one failed attempt per bucket and opportunistically prune old rows. */
export async function recordFailure(buckets: Bucket[]): Promise<void> {
  if (!enabled() || buckets.length === 0) return;
  try {
    await db
      .insert(schema.authAttempts)
      .values(buckets.map((b) => ({ key: b.key, kind: b.kind })));
    await db
      .delete(schema.authAttempts)
      .where(lt(schema.authAttempts.createdAt, new Date(Date.now() - PRUNE_AFTER_MS)));
  } catch {
    // Best-effort: never block auth on the throttle log failing.
  }
}

/** Clear a key's attempts after a successful auth so it resets cleanly. */
export async function clearAttempts(buckets: Bucket[]): Promise<void> {
  if (buckets.length === 0) return;
  try {
    await db.delete(schema.authAttempts).where(
      inArray(
        schema.authAttempts.key,
        buckets.map((b) => b.key),
      ),
    );
  } catch {
    // ignore
  }
}
