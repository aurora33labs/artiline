"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { auth } from "@/auth";
import { evaluateAccess } from "@/lib/visibility";
import { emitEvent } from "@/lib/webhooks/emit";

async function loadArtifactWithAccess(artifactId: string, password?: string) {
  const session = await auth();
  const [artifact] = await db
    .select()
    .from(schema.artifacts)
    .where(eq(schema.artifacts.id, artifactId))
    .limit(1);
  const access = await evaluateAccess(artifact ?? null, {
    sessionUserId: session?.user?.id ?? null,
    passwordAttempt: password ?? null,
  });
  if (access.kind !== "ok") throw new Error(access.kind.toUpperCase());
  return { session, artifact: artifact! };
}

const addCommentSchema = z.object({
  artifactId: z.string().min(1),
  versionId: z.string().min(1).optional().nullable(),
  body: z.string().min(1).max(2000),
  authorName: z.string().max(80).optional().nullable(),
  password: z.string().optional().nullable(),
  workspaceSlug: z.string().optional().nullable(),
  slug: z.string().optional().nullable(),
  x: z.number().min(0).max(1).optional().nullable(),
  y: z.number().min(0).max(1).optional().nullable(),
  width: z.number().min(0).max(1).optional().nullable(),
  height: z.number().min(0).max(1).optional().nullable(),
  targetType: z.enum(["point", "area", "global"]).optional().nullable(),
  iframeX: z.number().min(0).max(1).optional().nullable(),
  iframeY: z.number().min(0).max(1).optional().nullable(),
});

export async function addComment(formData: FormData) {
  const data = addCommentSchema.parse({
    artifactId: formData.get("artifactId"),
    versionId: formData.get("versionId") || null,
    body: formData.get("body"),
    authorName: formData.get("authorName") || null,
    password: formData.get("password") || null,
    workspaceSlug: formData.get("workspaceSlug") || null,
    slug: formData.get("slug") || null,
    x: formData.get("x") ? Number(formData.get("x")) : null,
    y: formData.get("y") ? Number(formData.get("y")) : null,
    width: formData.get("width") ? Number(formData.get("width")) : null,
    height: formData.get("height") ? Number(formData.get("height")) : null,
    targetType: formData.get("targetType") || null,
    iframeX: formData.get("iframeX") ? Number(formData.get("iframeX")) : null,
    iframeY: formData.get("iframeY") ? Number(formData.get("iframeY")) : null,
  });
  const { session, artifact } = await loadArtifactWithAccess(
    data.artifactId,
    data.password ?? undefined,
  );

  // Default to current pointer if no explicit versionId supplied
  const versionId = data.versionId ?? artifact.currentVersionId ?? null;

  const [comment] = await db
    .insert(schema.comments)
    .values({
      artifactId: artifact.id,
      versionId,
      userId: session?.user?.id ?? null,
      authorName: session?.user?.id ? null : data.authorName ?? "Anónimo",
      body: data.body,
    })
    .returning({ id: schema.comments.id });

  if (data.x !== null && data.y !== null) {
    const annotationValues = {
      commentId: comment.id,
      x: data.x as number,
      y: data.y as number,
      width: data.width ?? null,
      height: data.height ?? null,
      targetType: data.targetType ?? "point",
      iframeX: data.iframeX ?? null,
      iframeY: data.iframeY ?? null,
    };
    await db.insert(schema.annotations).values(annotationValues);
  }

  await emitEvent(artifact.workspaceId, "comment.created", {
    artifactId: artifact.id,
    versionId,
    userId: session?.user?.id ?? null,
    authorName: data.authorName ?? null,
    body: data.body,
  }).catch(() => {});

  if (data.workspaceSlug && data.slug) {
    revalidatePath(`/${data.workspaceSlug}/a/${data.slug}`);
  }
  if (data.slug) revalidatePath(`/a/${data.slug}`);
}

const updateAnnotationPositionSchema = z.object({
  commentId: z.string().min(1),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1).optional().nullable(),
  height: z.number().min(0).max(1).optional().nullable(),
  iframeX: z.number().min(0).max(1).optional().nullable(),
  iframeY: z.number().min(0).max(1).optional().nullable(),
});

export async function updateAnnotationPosition(input: {
  commentId: string;
  x: number;
  y: number;
  width?: number | null;
  height?: number | null;
  iframeX?: number | null;
  iframeY?: number | null;
}) {
  const data = updateAnnotationPositionSchema.parse(input);

  await db
    .update(schema.annotations)
    .set({
      x: data.x,
      y: data.y,
      width: data.width ?? null,
      height: data.height ?? null,
      iframeX: data.iframeX ?? null,
      iframeY: data.iframeY ?? null,
    })
    .where(eq(schema.annotations.commentId, data.commentId));
}

export async function deleteAnnotation(commentId: string) {
  await db.delete(schema.annotations).where(eq(schema.annotations.commentId, commentId));
}

const toggleReactionSchema = z.object({
  artifactId: z.string().min(1),
  emoji: z.string().min(1).max(8),
  password: z.string().optional().nullable(),
  workspaceSlug: z.string().optional().nullable(),
  slug: z.string().optional().nullable(),
});

export async function toggleReaction(input: {
  artifactId: string;
  emoji: string;
  password?: string;
  workspaceSlug?: string;
  slug?: string;
}) {
  const data = toggleReactionSchema.parse(input);
  const { session, artifact } = await loadArtifactWithAccess(
    data.artifactId,
    data.password ?? undefined,
  );
  if (!session?.user?.id) throw new Error("UNAUTH_REACTION");

  const existing = await db
    .select()
    .from(schema.reactions)
    .where(
      and(
        eq(schema.reactions.artifactId, artifact.id),
        eq(schema.reactions.userId, session.user.id),
        eq(schema.reactions.emoji, data.emoji),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .delete(schema.reactions)
      .where(
        and(
          eq(schema.reactions.artifactId, artifact.id),
          eq(schema.reactions.userId, session.user.id),
          eq(schema.reactions.emoji, data.emoji),
        ),
      );
  } else {
    await db.insert(schema.reactions).values({
      artifactId: artifact.id,
      userId: session.user.id,
      emoji: data.emoji,
    });
  }

  if (data.workspaceSlug && data.slug) {
    revalidatePath(`/${data.workspaceSlug}/a/${data.slug}`);
  }
  if (data.slug) revalidatePath(`/a/${data.slug}`);
}
