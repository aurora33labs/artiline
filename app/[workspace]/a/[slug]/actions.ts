"use server";

import bcrypt from "bcryptjs";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { requireMemberPage } from "@/lib/tenant";
import { emitEvent } from "@/lib/webhooks/emit";
import { recordEvent } from "@/lib/activity";
import { getContent, newVersionId, prepareContent } from "@/lib/artifact-content";
import { generateThumbnail } from "@/lib/artifact-thumb-gen";

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

  revalidatePath(`/${workspace.slug}/a/${artifact.slug}`);
  revalidatePath(`/${workspace.slug}`);
  revalidatePath(`/a/${artifact.slug}`);
}

const publishSchema = z.object({
  workspaceSlug: z.string().min(1),
  artifactId: z.string().min(1),
  type: z.enum(["html", "markdown", "code"]),
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  language: z.string().max(50).optional().nullable(),
  message: z.string().max(500).optional().nullable(),
});

export async function publishNewVersion(formData: FormData) {
  const data = publishSchema.parse({
    workspaceSlug: formData.get("workspaceSlug"),
    artifactId: formData.get("artifactId"),
    type: formData.get("type"),
    title: formData.get("title"),
    content: formData.get("content"),
    language: formData.get("language") || null,
    message: formData.get("message") || null,
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

  const versionId = newVersionId();
  const prepared = await prepareContent(versionId, data.content, data.type);

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
      type: data.type,
      content: prepared.content,
      contentKey: prepared.contentKey,
      contentSnippet: prepared.contentSnippet,
      contentBytes: prepared.contentBytes,
      language: data.language,
      title: data.title,
      message: data.message,
      authorUserId: session.user.id,
      reviewStatus: "pending",
    });

    await tx
      .update(schema.artifacts)
      .set({ updatedAt: new Date() })
      .where(eq(schema.artifacts.id, artifact.id));

    return Number(next);
  });

  if (data.type === "html") {
    void generateThumbnail(versionId, data.content).then((thumbKey) => {
      if (!thumbKey) return;
      return db
        .update(schema.artifactVersions)
        .set({ thumbKey })
        .where(eq(schema.artifactVersions.id, versionId));
    }).catch(() => {});
  }

  await emitEvent(workspace.id, "version.published", {
    artifactId: artifact.id,
    slug: artifact.slug,
    versionNumber: nextNumber,
    title: data.title,
    message: data.message ?? null,
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
      title: data.title,
      message: data.message ?? null,
    },
  }).catch(() => {});

  revalidatePath(`/${workspace.slug}/a/${artifact.slug}`);
  revalidatePath(`/${workspace.slug}/a/${artifact.slug}/versions`);
}

const rollbackSchema = z.object({
  workspaceSlug: z.string().min(1),
  artifactId: z.string().min(1),
  versionNumber: z.coerce.number().int().positive(),
  message: z.string().max(500).optional().nullable(),
});

export async function rollbackToVersion(formData: FormData) {
  const data = rollbackSchema.parse({
    workspaceSlug: formData.get("workspaceSlug"),
    artifactId: formData.get("artifactId"),
    versionNumber: formData.get("versionNumber"),
    message: formData.get("message") || null,
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
      reviewStatus: "pending",
    });

    await tx
      .update(schema.artifacts)
      .set({ updatedAt: new Date() })
      .where(eq(schema.artifacts.id, artifact.id));
  });

  revalidatePath(`/${workspace.slug}/a/${artifact.slug}`);
  revalidatePath(`/${workspace.slug}/a/${artifact.slug}/versions`);
}

const setStatusSchema = z.object({
  workspaceSlug: z.string().min(1),
  versionId: z.string().min(1),
  status: z.enum(["pending", "approved", "changes_requested"]),
});

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
  }

  revalidatePath(`/${workspace.slug}/a/${version.artifact.slug}`);
  revalidatePath(`/${workspace.slug}/a/${version.artifact.slug}/versions`);
  revalidatePath(`/a/${version.artifact.slug}`);
}
