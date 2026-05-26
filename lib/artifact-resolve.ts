import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export type ResolvedArtifact = {
  artifact: typeof schema.artifacts.$inferSelect;
  version: typeof schema.artifactVersions.$inferSelect;
};

/**
 * Resolve an artifact + its current (live) version by slug.
 *
 * Returns null if artifact not found or has no current version (shouldn't
 * happen post-backfill, but guarded for safety).
 */
export async function resolveCurrentArtifact(
  slug: string,
): Promise<ResolvedArtifact | null> {
  const [row] = await db
    .select()
    .from(schema.artifacts)
    .where(eq(schema.artifacts.slug, slug))
    .limit(1);
  if (!row || !row.currentVersionId) return null;

  const [version] = await db
    .select()
    .from(schema.artifactVersions)
    .where(eq(schema.artifactVersions.id, row.currentVersionId))
    .limit(1);
  if (!version) return null;

  return { artifact: row, version };
}

/**
 * Resolve an artifact + a specific pinned version by slug + version number.
 */
export async function resolveArtifactVersion(
  slug: string,
  versionNumber: number,
): Promise<ResolvedArtifact | null> {
  const [row] = await db
    .select()
    .from(schema.artifacts)
    .where(eq(schema.artifacts.slug, slug))
    .limit(1);
  if (!row) return null;

  const [version] = await db
    .select()
    .from(schema.artifactVersions)
    .where(
      and(
        eq(schema.artifactVersions.artifactId, row.id),
        eq(schema.artifactVersions.versionNumber, versionNumber),
      ),
    )
    .limit(1);
  if (!version) return null;

  return { artifact: row, version };
}
