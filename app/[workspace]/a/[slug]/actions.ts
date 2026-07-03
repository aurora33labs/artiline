"use server";

import bcrypt from "bcryptjs";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { requireMemberPage } from "@/lib/tenant";
import { deleteObjects } from "@/lib/r2";
import { emitEvent } from "@/lib/webhooks/emit";
import { recordEvent } from "@/lib/activity";
import { notifyDecision } from "@/lib/notifications";
import { getContent, newVersionId, prepareContent } from "@/lib/artifact-content";
import { generateThumbnail } from "@/lib/artifact-thumb-gen";
import { isReactRenderable } from "@/lib/detect-artifact";
import { pruneArtifactVersions } from "@/lib/versions";

const inputSchema = z.object({
  workspaceSlug: z.string().min(1),
  artifactId: z.string().min(1),
  visibility: z.enum(["internal_pw", "internal", "public_pw", "public"]),
  password: z.string().optional().nullable(),
  changePassword: z.union([z.literal("on"), z.literal(""), z.null()]).optional(),
});

export async function updateArtifactVisibility(formData: FormData) {
  const data = inputSchema.parse({
    workspaceSlug: formData.get("workspaceSlug"),
    artifactId: formData.get("artifactId"),
    visibility: formData.get("visibility"),
    password: formData.get("password") || null,
    changePassword: formData.get("changePassword"),
  });

  const { session, workspace, role } = await requireMemberPage(data.workspaceSlug);

  const [artifact] = await db
    .select()
    .from(schema.artifacts)
    .where(eq(schema.artifacts.id, data.artifactId))
    .limit(1);
  if (!artifact) throw new Error("NOT_FOUND");
  if (artifact.workspaceId !== workspace.id) throw new Error("FORBIDDEN");

  const isAuthor = artifact.authorUserId === session.user.id;
  const isManager = role === "owner" || role === "admin";
  if (!isAuthor && !isManager) throw new Error("FORBIDDEN");

  const needsPw =
    data.visibility === "internal_pw" || data.visibility === "public_pw";

  let passwordHash: string | null = artifact.passwordHash;

  if (!needsPw) {
    passwordHash = null;
  } else {
    const hadPassword = !!artifact.passwordHash;
    const wantsNewPw = data.changePassword === "on" || !hadPassword;
    if (wantsNewPw) {
      if (!data.password || data.password.length < 4) {
        throw new Error("ERR_PASSWORD_TOO_SHORT");
      }
      passwordHash = await bcrypt.hash(data.password, 10);
    }
  }

  await db
    .update(schema.artifacts)
    .set({
      visibility: data.visibility,
      passwordHash,
      updatedAt: new Date(),
    })
    .where(eq(schema.artifacts.id, artifact.id));

  if (data.visibility !== artifact.visibility) {
    await recordEvent({
      workspaceId: workspace.id,
      actorUserId: session.user.id,
      type: "visibility.changed",
      subjectType: "artifact",
      subjectId: artifact.id,
      payload: { slug: artifact.slug, from: artifact.visibility, to: data.visibility },
    }).catch(() => {});
  }

  revalidatePath(`/${workspace.slug}/a/${artifact.slug}`);
  revalidatePath(`/${workspace.slug}`);
  revalidatePath(`/a/${artifact.slug}`);
}

const deleteSchema = z.object({
  workspaceSlug: z.string().min(1),
  artifactId: z.string().min(1),
});

/**
 * Permanently delete an artifact. Author or workspace owner/admin only (checked
 * server-side, never trust the client). DB rows (versions, exports, comments,
 * reactions, view events) cascade automatically; object storage for content,
 * thumbnails and exports is cleaned up best-effort first so a storage failure
 * can't block the delete.
 */
export async function deleteArtifact(formData: FormData) {
  const data = deleteSchema.parse({
    workspaceSlug: formData.get("workspaceSlug"),
    artifactId: formData.get("artifactId"),
  });

  const { session, workspace, role } = await requireMemberPage(data.workspaceSlug);

  const [artifact] = await db
    .select()
    .from(schema.artifacts)
    .where(eq(schema.artifacts.id, data.artifactId))
    .limit(1);
  if (!artifact) throw new Error("NOT_FOUND");
  if (artifact.workspaceId !== workspace.id) throw new Error("FORBIDDEN");

  const isAuthor = artifact.authorUserId === session.user.id;
  const isManager = role === "owner" || role === "admin";
  if (!isAuthor && !isManager) throw new Error("FORBIDDEN");

  // Collect object-storage keys before the cascade removes the rows.
  const versions = await db
    .select({
      contentKey: schema.artifactVersions.contentKey,
      thumbKey: schema.artifactVersions.thumbKey,
    })
    .from(schema.artifactVersions)
    .where(eq(schema.artifactVersions.artifactId, artifact.id));
  const exports = await db
    .select({ r2Key: schema.artifactExports.r2Key })
    .from(schema.artifactExports)
    .where(eq(schema.artifactExports.artifactId, artifact.id));

  await deleteObjects([
    ...versions.flatMap((v) => [v.contentKey, v.thumbKey]),
    ...exports.map((e) => e.r2Key),
  ]);

  await db.delete(schema.artifacts).where(eq(schema.artifacts.id, artifact.id));

  await emitEvent(workspace.id, "artifact.deleted", {
    artifactId: artifact.id,
    slug: artifact.slug,
    actorUserId: session.user.id,
  }).catch(() => {});
  await recordEvent({
    workspaceId: workspace.id,
    actorUserId: session.user.id,
    type: "artifact.deleted",
    subjectType: "artifact",
    subjectId: artifact.id,
    payload: { slug: artifact.slug },
  }).catch(() => {});

  revalidatePath(`/${workspace.slug}`);
  redirect(`/${workspace.slug}`);
}

const rollbackSchema = z.object({
  workspaceSlug: z.string().min(1),
  artifactId: z.string().min(1),
  versionNumber: z.coerce.number().int().positive(),
  message: z.string().max(500).optional().nullable(),
  mode: z.enum(["propose", "direct"]).default("propose"),
});

export async function rollbackToVersion(formData: FormData) {
  const data = rollbackSchema.parse({
    workspaceSlug: formData.get("workspaceSlug"),
    artifactId: formData.get("artifactId"),
    versionNumber: formData.get("versionNumber"),
    message: formData.get("message") || null,
    mode: formData.get("mode") || "propose",
  });

  const { session, workspace, role } = await requireMemberPage(data.workspaceSlug);

  const [artifact] = await db
    .select()
    .from(schema.artifacts)
    .where(eq(schema.artifacts.id, data.artifactId))
    .limit(1);
  if (!artifact) throw new Error("NOT_FOUND");
  if (artifact.workspaceId !== workspace.id) throw new Error("FORBIDDEN");

  const isManager = role === "owner" || role === "admin";
  if (data.mode === "direct") {
    // Direct rollback (publish without going through review) is owner/admin only.
    if (!isManager) throw new Error("FORBIDDEN");
  } else {
    const isAuthor = artifact.authorUserId === session.user.id;
    if (!isAuthor && !isManager) throw new Error("FORBIDDEN");
  }

  const [target] = await db
    .select()
    .from(schema.artifactVersions)
    .where(
      and(
        eq(schema.artifactVersions.artifactId, artifact.id),
        eq(schema.artifactVersions.versionNumber, data.versionNumber),
      ),
    )
    .limit(1);
  if (!target) throw new Error("NOT_FOUND");

  // The target's content may live in object storage — read it through getContent
  // and re-store for the new version (re-uploads under the new version's key).
  const targetContent = await getContent(target);
  const versionId = newVersionId();
  const prepared = await prepareContent(versionId, targetContent, target.type);

  const isDirect = data.mode === "direct";

  await db.transaction(async (tx) => {
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
      type: target.type,
      content: prepared.content,
      contentKey: prepared.contentKey,
      contentSnippet: prepared.contentSnippet,
      contentBytes: prepared.contentBytes,
      language: target.language,
      title: target.title,
      message:
        data.message ?? `Rollback to v${data.versionNumber}`,
      authorUserId: session.user.id,
      reviewStatus: isDirect ? "approved" : "pending",
      ...(isDirect
        ? { reviewedByUserId: session.user.id, reviewedAt: new Date() }
        : {}),
    });

    await tx
      .update(schema.artifacts)
      .set({
        updatedAt: new Date(),
        ...(isDirect ? { currentVersionId: versionId } : {}),
      })
      .where(eq(schema.artifacts.id, artifact.id));
  });

  await emitEvent(workspace.id, "version.rolled_back", {
    artifactId: artifact.id,
    slug: artifact.slug,
    fromVersionNumber: data.versionNumber,
    toVersionId: versionId,
    direct: isDirect,
  }).catch(() => {});
  await recordEvent({
    workspaceId: workspace.id,
    actorUserId: session.user.id,
    type: "version.rolled_back",
    subjectType: "version",
    subjectId: artifact.id,
    payload: { slug: artifact.slug, toVersionNumber: data.versionNumber, direct: isDirect },
  }).catch(() => {});

  // Generate the thumbnail for the new (rolled-back) version — best-effort.
  const reactThumb = isReactRenderable(target.type, target.language);
  if (target.type === "html" || reactThumb) {
    void generateThumbnail(versionId, targetContent, { react: reactThumb })
      .then((thumbKey) => {
        if (!thumbKey) return;
        return db
          .update(schema.artifactVersions)
          .set({ thumbKey })
          .where(eq(schema.artifactVersions.id, versionId));
      })
      .catch(() => {});
  }

  // Keep history bounded; never drop the live version.
  await pruneArtifactVersions(
    artifact.id,
    workspace.maxVersions,
    artifact.currentVersionId,
  );

  revalidatePath(`/${workspace.slug}/a/${artifact.slug}`);
  revalidatePath(`/${workspace.slug}/a/${artifact.slug}/versions`);
}

const setStatusSchema = z.object({
  workspaceSlug: z.string().min(1),
  versionId: z.string().min(1),
  status: z.enum(["pending", "approved", "changes_requested"]),
});

const discardSchema = z.object({
  workspaceSlug: z.string().min(1),
  versionId: z.string().min(1),
});

/**
 * Discard a proposed version (pending / changes_requested) that never went
 * live — cleans up rejected or withdrawn proposals so history doesn't fill with
 * them. Author/admin may discard any proposal; the proposer may withdraw their
 * own. Refuses to touch an approved or currently-live version. Deletes the row
 * (DB children cascade) and its object storage.
 */
export async function discardVersion(formData: FormData) {
  const data = discardSchema.parse({
    workspaceSlug: formData.get("workspaceSlug"),
    versionId: formData.get("versionId"),
  });

  const { session, workspace, role } = await requireMemberPage(
    data.workspaceSlug,
  );

  const [row] = await db
    .select({
      version: schema.artifactVersions,
      artifact: schema.artifacts,
    })
    .from(schema.artifactVersions)
    .innerJoin(
      schema.artifacts,
      eq(schema.artifacts.id, schema.artifactVersions.artifactId),
    )
    .where(eq(schema.artifactVersions.id, data.versionId))
    .limit(1);
  if (!row) throw new Error("NOT_FOUND");
  if (row.artifact.workspaceId !== workspace.id) throw new Error("FORBIDDEN");

  // Only proposals can be discarded — never the live version or an approved one.
  const isProposal =
    row.version.reviewStatus === "pending" ||
    row.version.reviewStatus === "changes_requested";
  const isLive = row.artifact.currentVersionId === row.version.id;
  if (!isProposal || isLive) throw new Error("FORBIDDEN");

  const isManager = role === "owner" || role === "admin";
  const isArtifactAuthor = row.artifact.authorUserId === session.user.id;
  const isProposer = row.version.authorUserId === session.user.id;
  if (!isManager && !isArtifactAuthor && !isProposer)
    throw new Error("FORBIDDEN");

  await deleteObjects([row.version.contentKey, row.version.thumbKey]);
  await db
    .delete(schema.artifactVersions)
    .where(eq(schema.artifactVersions.id, row.version.id));

  revalidatePath(`/${workspace.slug}/a/${row.artifact.slug}/versions`);
}

export async function setReviewStatus(formData: FormData) {
  const data = setStatusSchema.parse({
    workspaceSlug: formData.get("workspaceSlug"),
    versionId: formData.get("versionId"),
    status: formData.get("status"),
  });

  const { session, workspace, role } = await requireMemberPage(data.workspaceSlug);

  const [version] = await db
    .select({
      version: schema.artifactVersions,
      artifact: schema.artifacts,
    })
    .from(schema.artifactVersions)
    .innerJoin(
      schema.artifacts,
      eq(schema.artifacts.id, schema.artifactVersions.artifactId),
    )
    .where(eq(schema.artifactVersions.id, data.versionId))
    .limit(1);
  if (!version) throw new Error("NOT_FOUND");
  if (version.artifact.workspaceId !== workspace.id)
    throw new Error("FORBIDDEN");

  const isAuthor = version.artifact.authorUserId === session.user.id;
  const isManager = role === "owner" || role === "admin";
  if (!isAuthor && !isManager) throw new Error("FORBIDDEN");

  await db.transaction(async (tx) => {
    await tx
      .update(schema.artifactVersions)
      .set({
        reviewStatus: data.status,
        reviewedByUserId: session.user.id,
        reviewedAt: new Date(),
      })
      .where(eq(schema.artifactVersions.id, data.versionId));

    if (data.status === "approved") {
      await tx
        .update(schema.artifacts)
        .set({
          currentVersionId: data.versionId,
          updatedAt: new Date(),
        })
        .where(eq(schema.artifacts.id, version.artifact.id));
    }
  });

  const eventName =
    data.status === "approved"
      ? "version.approved"
      : data.status === "changes_requested"
        ? "version.changes_requested"
        : null;
  if (eventName) {
    await emitEvent(workspace.id, eventName, {
      artifactId: version.artifact.id,
      slug: version.artifact.slug,
      versionId: data.versionId,
      versionNumber: version.version.versionNumber,
      title: version.version.title,
      reviewedByUserId: session.user.id,
    }).catch(() => {});
    await recordEvent({
      workspaceId: workspace.id,
      actorUserId: session.user.id,
      type: eventName,
      subjectType: "version",
      subjectId: version.artifact.id,
      payload: {
        slug: version.artifact.slug,
        versionNumber: version.version.versionNumber,
        title: version.version.title,
      },
    }).catch(() => {});
    await notifyDecision({
      workspaceId: workspace.id,
      actorUserId: session.user.id,
      proposerUserId: version.version.authorUserId,
      artifactId: version.artifact.id,
      type: eventName,
      payload: {
        actorName: session.user.name ?? session.user.email ?? undefined,
        artifactSlug: version.artifact.slug,
        artifactTitle: version.version.title,
        versionNumber: version.version.versionNumber,
      },
    }).catch(() => {});
  }

  revalidatePath(`/${workspace.slug}/a/${version.artifact.slug}`);
  revalidatePath(`/${workspace.slug}/a/${version.artifact.slug}/versions`);
  revalidatePath(`/a/${version.artifact.slug}`);
}
