import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { deleteObjects } from "@/lib/r2";

export const DEFAULT_MAX_VERSIONS = 5;
export const MIN_MAX_VERSIONS = 1;
export const MAX_MAX_VERSIONS = 50;

/**
 * Keep an artifact's history bounded: retain at most `cap` versions (the newest
 * by versionNumber) plus the live version, and remove the rest. Dropped version
 * rows cascade their DB children; their object storage (content + thumbnail) is
 * cleaned best-effort. Never throws into the publish path.
 */
export async function pruneArtifactVersions(
  artifactId: string,
  cap: number,
  keepVersionId: string | null,
): Promise<void> {
  try {
    const versions = await db
      .select({
        id: schema.artifactVersions.id,
        contentKey: schema.artifactVersions.contentKey,
        thumbKey: schema.artifactVersions.thumbKey,
        reviewStatus: schema.artifactVersions.reviewStatus,
      })
      .from(schema.artifactVersions)
      .where(eq(schema.artifactVersions.artifactId, artifactId))
      .orderBy(desc(schema.artifactVersions.versionNumber));

    if (versions.length <= cap) return;

    const keep = new Set(versions.slice(0, cap).map((v) => v.id));
    if (keepVersionId) keep.add(keepVersionId); // never drop the live version
    // Never evict open proposals — a pending/changes_requested version is
    // someone's un-reviewed work, not part of the bounded approved history.
    for (const v of versions) {
      if (v.reviewStatus === "pending" || v.reviewStatus === "changes_requested")
        keep.add(v.id);
    }
    const drop = versions.filter((v) => !keep.has(v.id));
    if (!drop.length) return;

    await deleteObjects(drop.flatMap((v) => [v.contentKey, v.thumbKey]));
    await db.delete(schema.artifactVersions).where(
      inArray(
        schema.artifactVersions.id,
        drop.map((v) => v.id),
      ),
    );
  } catch {
    // Pruning is housekeeping — a failure must not fail the publish.
  }
}
