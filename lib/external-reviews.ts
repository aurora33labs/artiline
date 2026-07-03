import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { recordEvent } from "@/lib/activity";
import { type Bucket, isRateLimited, recordFailure } from "@/lib/rate-limit";

export type ExternalSiteContext = {
  site: typeof schema.externalSites.$inferSelect;
  artifact: typeof schema.artifacts.$inferSelect;
};

/** Resolve a widget's public key to its site + parent artifact, if enabled. */
export async function resolveSiteByKey(
  key: string,
): Promise<ExternalSiteContext | null> {
  const [row] = await db
    .select({ site: schema.externalSites, artifact: schema.artifacts })
    .from(schema.externalSites)
    .innerJoin(schema.artifacts, eq(schema.artifacts.id, schema.externalSites.artifactId))
    .where(and(eq(schema.externalSites.publicKey, key), eq(schema.externalSites.enabled, true)))
    .limit(1);
  return row ?? null;
}

/**
 * The widget's public key travels in the client's HTML, so it can't gate on
 * secrecy alone — the registered Origin is the actual boundary. An exact
 * string match against `site.origin` (scheme+host[+port], no path) rejects
 * every other origin, including subdomains and http/https mismatches.
 */
export function checkOrigin(req: Request, site: { origin: string }): boolean {
  const origin = req.headers.get("origin");
  return !!origin && origin === site.origin;
}

/** CORS headers for a request already verified by `checkOrigin`. */
export function reviewCorsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

const STALE_DAMPEN_MS = 60 * 60 * 1000; // don't re-flag more than once/hour/page

/**
 * Upsert the page's last-known content hash. When it changes (and the page
 * hasn't already been flagged within the last hour — dampens noisy/dynamic
 * pages), mark existing annotations on that page as possibly stale and log an
 * activity event so the team notices without polling.
 */
export async function recordPageHash(args: {
  artifactId: string;
  workspaceId: string;
  path: string;
  hash: string;
  title?: string | null;
}): Promise<void> {
  const { artifactId, workspaceId, path, hash, title } = args;
  const [existing] = await db
    .select()
    .from(schema.externalPages)
    .where(and(eq(schema.externalPages.artifactId, artifactId), eq(schema.externalPages.path, path)))
    .limit(1);

  const now = new Date();
  const changed = !!existing?.lastHash && existing.lastHash !== hash;
  const recentlyFlagged =
    !!existing?.lastChangedAt && now.getTime() - existing.lastChangedAt.getTime() < STALE_DAMPEN_MS;

  if (existing) {
    await db
      .update(schema.externalPages)
      .set({
        lastHash: hash,
        title: title ?? existing.title,
        lastSeenAt: now,
        ...(changed && !recentlyFlagged ? { lastChangedAt: now } : {}),
      })
      .where(eq(schema.externalPages.id, existing.id));
  } else {
    await db.insert(schema.externalPages).values({
      artifactId,
      path,
      title: title ?? null,
      lastHash: hash,
      lastSeenAt: now,
    });
  }

  if (changed && !recentlyFlagged) {
    await markPageAnnotationsStale(artifactId, path);
    await recordEvent({
      workspaceId,
      actorUserId: null,
      type: "external.page_changed",
      subjectType: "external_page",
      subjectId: artifactId,
      payload: { path },
    }).catch(() => {});
  }
}

async function markPageAnnotationsStale(artifactId: string, path: string): Promise<void> {
  const rows = await db
    .select({ commentId: schema.comments.id })
    .from(schema.comments)
    .where(and(eq(schema.comments.artifactId, artifactId), eq(schema.comments.pageUrl, path)));
  const commentIds = rows.map((r) => r.commentId);
  if (commentIds.length === 0) return;
  await db
    .update(schema.annotations)
    .set({ staleAt: new Date() })
    .where(inArray(schema.annotations.commentId, commentIds));
}

/** Rate-limit buckets for a review-widget request from a given site + IP. */
export function reviewRateBuckets(kind: string, artifactId: string, ip: string | null): Bucket[] {
  const buckets: Bucket[] = [
    { key: `arev:${artifactId}`, kind, limit: 60, windowMin: 10 },
  ];
  if (ip) buckets.push({ key: `arevip:${ip}`, kind, limit: 20, windowMin: 10 });
  return buckets;
}

export async function checkReviewRateLimit(
  kind: string,
  artifactId: string,
  ip: string | null,
): Promise<boolean> {
  const buckets = reviewRateBuckets(kind, artifactId, ip);
  const { limited } = await isRateLimited(buckets);
  // Every call (not just failures) counts as an attempt — recordFailure here
  // just means "log one hit", matching how lib/rate-limit.ts's table is used
  // elsewhere for cumulative attempt counts, not literal auth failures.
  await recordFailure(buckets);
  return limited;
}
