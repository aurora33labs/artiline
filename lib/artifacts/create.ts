import "server-only";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, schema } from "@/lib/db";
import type { AuthContext } from "@/lib/tenant";
import { assertCanCreateArtifact } from "@/lib/limits";
import {
  MAX_CONTENT_BYTES,
  newVersionId,
  prepareContent,
} from "@/lib/artifact-content";
import { generateThumbnail } from "@/lib/artifact-thumb-gen";
import { isReactRenderable } from "@/lib/detect-artifact";
import { recordEvent } from "@/lib/activity";
import { emitEvent } from "@/lib/webhooks/emit";

export type ArtifactType = "html" | "markdown" | "code";
export type Visibility = "internal_pw" | "internal" | "public_pw" | "public";

export type CreateArtifactInput = {
  type: ArtifactType;
  title: string;
  content: string;
  language?: string | null;
  visibility: Visibility;
  password?: string | null;
  cleanShare?: boolean;
};

/**
 * Tagged errors the callers translate into transport-appropriate responses
 * (HTTP status for the route handler, MCP error for the MCP tool). Kept as
 * plain `Error` messages so existing `catch (msg === ...)` checks keep working.
 */
export type CreateArtifactError =
  | "ERR_CONTENT_TOO_LARGE"
  | "ERR_PASSWORD_TOO_SHORT"
  | "LIMIT_ARTIFACTS";

/**
 * Create an artifact and its first version. The single source of truth shared by
 * the HTTP route handler (form upload) and the MCP `create_artifact` tool, so
 * both apply identical size caps, quota enforcement, attribution, and thumbnail
 * generation. The caller is responsible for authentication; pass the resolved
 * `AuthContext` (session or API-token derived).
 */
export async function createArtifact(
  ctx: AuthContext,
  input: CreateArtifactInput,
): Promise<{ slug: string; id: string }> {
  const { workspace, session } = ctx;

  if (Buffer.byteLength(input.content, "utf8") > MAX_CONTENT_BYTES) {
    throw new Error("ERR_CONTENT_TOO_LARGE");
  }

  await assertCanCreateArtifact(workspace.id);

  const needsPw =
    input.visibility === "internal_pw" || input.visibility === "public_pw";
  if (needsPw && (!input.password || input.password.length < 4)) {
    throw new Error("ERR_PASSWORD_TOO_SHORT");
  }
  const passwordHash =
    needsPw && input.password ? await bcrypt.hash(input.password, 10) : null;

  const versionId = newVersionId();
  const prepared = await prepareContent(versionId, input.content, input.type);

  const created = await db.transaction(async (tx) => {
    const [artifact] = await tx
      .insert(schema.artifacts)
      .values({
        workspaceId: workspace.id,
        authorUserId: session.user.id,
        slug: nanoid(10),
        visibility: input.visibility,
        passwordHash,
        cleanShare: input.cleanShare ?? false,
      })
      .returning();

    await tx.insert(schema.artifactVersions).values({
      id: versionId,
      artifactId: artifact.id,
      versionNumber: 1,
      type: input.type,
      content: prepared.content,
      contentKey: prepared.contentKey,
      contentSnippet: prepared.contentSnippet,
      contentBytes: prepared.contentBytes,
      language: input.language ?? null,
      title: input.title,
      message: null,
      authorUserId: session.user.id,
      reviewStatus: "approved",
      reviewedByUserId: session.user.id,
      reviewedAt: new Date(),
    });

    await tx
      .update(schema.artifacts)
      .set({ currentVersionId: versionId })
      .where(eq(schema.artifacts.id, artifact.id));

    return artifact;
  });

  await recordEvent({
    workspaceId: workspace.id,
    actorUserId: session.user.id,
    type: "artifact.created",
    subjectType: "artifact",
    subjectId: created.id,
    payload: { slug: created.slug, title: input.title, type: input.type },
  }).catch(() => {});

  // AuthContext.session.user only carries `id` (may be a token) — resolve the
  // display name for the webhook payload from the users table.
  const [actor] = await db
    .select({ name: schema.users.name, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id))
    .limit(1);

  await emitEvent(workspace.id, "artifact.created", {
    artifactId: created.id,
    workspaceSlug: workspace.slug,
    slug: created.slug,
    title: input.title,
    type: input.type,
    versionNumber: 1,
    visibility: input.visibility,
    actorName: actor?.name ?? actor?.email ?? null,
  }).catch(() => {});

  // Fire-and-forget thumbnail (HTML + renderable React, best-effort). The
  // container is long-lived (not serverless), so this completes after the
  // response.
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

  return { slug: created.slug, id: created.id };
}
