import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { AuthContext } from "@/lib/tenant";
import {
  MAX_CONTENT_BYTES,
  newVersionId,
  prepareContent,
} from "@/lib/artifact-content";
import { generateThumbnail } from "@/lib/artifact-thumb-gen";
import { isReactRenderable } from "@/lib/detect-artifact";
import { emitEvent } from "@/lib/webhooks/emit";
import { recordEvent } from "@/lib/activity";
import { notifyProposal } from "@/lib/notifications";
import type { PublishVersionInput } from "@/lib/artifacts/publish-version";

export type ProposeVersionError =
  | "ERR_CONTENT_TOO_LARGE"
  | "NOT_FOUND"
  | "FORBIDDEN";

/**
 * Propose a new version of an existing artifact for review. Unlike
 * `publishVersion`, ANY workspace member may call this — the version is saved as
 * `pending` and does NOT go live (currentVersionId is untouched). An author or
 * owner/admin later approves it (→ live) or requests changes via
 * `setReviewStatus`. History is not pruned, so a proposal never evicts approved
 * versions. Notifies the artifact author + workspace managers.
 */
export async function proposeVersion(
  ctx: AuthContext,
  artifactId: string,
  input: PublishVersionInput,
  assignedReviewerId?: string | null,
): Promise<{ slug: string; versionNumber: number }> {
  const { workspace, session } = ctx;

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

  // A reviewer, if given, must actually be a member of this workspace — never
  // trust the caller-supplied id past that check.
  let reviewerId: string | null = null;
  if (assignedReviewerId) {
    const [member] = await db
      .select({ userId: schema.workspaceMembers.userId })
      .from(schema.workspaceMembers)
      .where(
        and(
          eq(schema.workspaceMembers.workspaceId, workspace.id),
          eq(schema.workspaceMembers.userId, assignedReviewerId),
        ),
      )
      .limit(1);
    if (member) reviewerId = assignedReviewerId;
  }

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
      reviewStatus: "pending",
      assignedReviewerId: reviewerId,
    });
    // Deliberately NOT touching artifacts.currentVersionId — a proposal is not
    // live until approved.
    return Number(next);
  });

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

  // AuthContext.session.user only carries `id` (may be a token), so resolve the
  // display name for the notification payload from the users table.
  const [actor] = await db
    .select({ name: schema.users.name, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id))
    .limit(1);
  const actorName = actor?.name ?? actor?.email ?? null;

  await emitEvent(workspace.id, "version.proposed", {
    artifactId: artifact.id,
    slug: artifact.slug,
    versionNumber: nextNumber,
    title: input.title,
    authorUserId: session.user.id,
  }).catch(() => {});
  await recordEvent({
    workspaceId: workspace.id,
    actorUserId: session.user.id,
    type: "version.proposed",
    subjectType: "version",
    subjectId: artifact.id,
    payload: {
      slug: artifact.slug,
      versionNumber: nextNumber,
      title: input.title,
    },
  }).catch(() => {});
  await notifyProposal({
    workspaceId: workspace.id,
    actorUserId: session.user.id,
    authorUserId: artifact.authorUserId,
    assignedReviewerId: reviewerId,
    artifactId: artifact.id,
    payload: {
      actorName: actorName ?? undefined,
      artifactSlug: artifact.slug,
      artifactTitle: input.title,
      versionNumber: nextNumber,
    },
  }).catch(() => {});

  return { slug: artifact.slug, versionNumber: nextNumber };
}
