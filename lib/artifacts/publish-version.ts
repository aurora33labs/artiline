import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { AuthContext } from "@/lib/tenant";
import {
  MAX_CONTENT_BYTES,
  newVersionId,
  prepareContent,
} from "@/lib/artifact-content";
import { generateThumbnail } from "@/lib/artifact-thumb-gen";
import { isReactRenderable } from "@/lib/detect-artifact";
import { pruneArtifactVersions } from "@/lib/versions";
import { emitEvent } from "@/lib/webhooks/emit";
import { recordEvent } from "@/lib/activity";
import type { ArtifactType } from "@/lib/artifacts/create";

export type PublishVersionInput = {
  type: ArtifactType;
  title: string;
  content: string;
  language?: string | null;
  message?: string | null;
};

/**
 * Errors translated by callers. `NOT_FOUND` covers both a missing artifact and
 * one outside the caller's workspace (no existence leak). `FORBIDDEN` is a member
 * who is neither the author nor a manager.
 */
export type PublishVersionError =
  | "ERR_CONTENT_TOO_LARGE"
  | "NOT_FOUND"
  | "FORBIDDEN";

/**
 * Publish a new version of an existing artifact (re-upload). Shared by the HTTP
 * route handler and any token-authenticated caller. Goes live immediately
 * (approved + current); history is pruned to the workspace's `maxVersions`.
 */
export async function publishVersion(
  ctx: AuthContext,
  artifactId: string,
  input: PublishVersionInput,
): Promise<{ slug: string; versionNumber: number }> {
  const { workspace, session, role } = ctx;

  if (Buffer.byteLength(input.content, "utf8") > MAX_CONTENT_BYTES) {
    throw new Error("ERR_CONTENT_TOO_LARGE");
  }

  const [artifact] = await db
    .select()
    .from(schema.artifacts)
    .where(eq(schema.artifacts.id, artifactId))
    .limit(1);
  if (!artifact || artifact.workspaceId !== workspace.id) {
    throw new Error("NOT_FOUND");
  }

  // External-site artifacts have no uploadable content — publishing to them
  // isn't a valid operation regardless of caller/role.
  const [externalSite] = await db
    .select({ artifactId: schema.externalSites.artifactId })
    .from(schema.externalSites)
    .where(eq(schema.externalSites.artifactId, artifactId))
    .limit(1);
  if (externalSite) throw new Error("FORBIDDEN");

  const isAuthor = artifact.authorUserId === session.user.id;
  const isManager = role === "owner" || role === "admin";
  if (!isAuthor && !isManager) throw new Error("FORBIDDEN");

  const versionId = newVersionId();
  const prepared = await prepareContent(versionId, input.content, input.type);

  const nextNumber = await db.transaction(async (tx) => {
    const [{ next }] = await tx
      .select({
        next: sql<number>`coalesce(max(${schema.artifactVersions.versionNumber}), 0) + 1`,
      })
      .from(schema.artifactVersions)
      .where(eq(schema.artifactVersions.artifactId, artifact.id));

    await tx.insert(schema.artifactVersions).values({
      id: versionId,
      artifactId: artifact.id,
      versionNumber: Number(next),
      type: input.type,
      content: prepared.content,
      contentKey: prepared.contentKey,
      contentSnippet: prepared.contentSnippet,
      contentBytes: prepared.contentBytes,
      language: input.language ?? null,
      title: input.title,
      message: input.message ?? null,
      authorUserId: session.user.id,
      reviewStatus: "approved",
      reviewedByUserId: session.user.id,
      reviewedAt: new Date(),
    });

    await tx
      .update(schema.artifacts)
      .set({ currentVersionId: versionId, updatedAt: new Date() })
      .where(eq(schema.artifacts.id, artifact.id));

    return Number(next);
  });

  await pruneArtifactVersions(artifact.id, workspace.maxVersions, versionId);

  const reactThumb = isReactRenderable(input.type, input.language ?? undefined);
  if (input.type === "html" || reactThumb) {
    void generateThumbnail(versionId, input.content, { react: reactThumb })
      .then((thumbKey) => {
        if (!thumbKey) return;
        return db
          .update(schema.artifactVersions)
          .set({ thumbKey })
          .where(eq(schema.artifactVersions.id, versionId));
      })
      .catch(() => {});
  }

  await emitEvent(workspace.id, "version.published", {
    artifactId: artifact.id,
    slug: artifact.slug,
    versionNumber: nextNumber,
    title: input.title,
    message: input.message ?? null,
    authorUserId: session.user.id,
  }).catch(() => {});
  await recordEvent({
    workspaceId: workspace.id,
    actorUserId: session.user.id,
    type: "version.published",
    subjectType: "version",
    subjectId: artifact.id,
    payload: {
      slug: artifact.slug,
      versionNumber: nextNumber,
      title: input.title,
    },
  }).catch(() => {});

  return { slug: artifact.slug, versionNumber: nextNumber };
}
