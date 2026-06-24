"use server";

import { and, eq, isNull } from "drizzle-orm";
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
  targetType: z.enum(["point", "area", "global", "text", "element"]).optional().nullable(),
  iframeX: z.number().min(0).max(1).optional().nullable(),
  iframeY: z.number().min(0).max(1).optional().nullable(),
  selectedText: z.string().max(2000).optional().nullable(),
  anchorXPath: z.string().max(1000).optional().nullable(),
  anchorOffset: z.number().int().min(0).optional().nullable(),
  anchorEndXPath: z.string().max(1000).optional().nullable(),
  anchorEndOffset: z.number().int().min(0).optional().nullable(),
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
    selectedText: formData.get("selectedText") as string || null,
    anchorXPath: formData.get("anchorXPath") as string || null,
    anchorOffset: formData.get("anchorOffset") ? Number(formData.get("anchorOffset")) : null,
    anchorEndXPath: formData.get("anchorEndXPath") as string || null,
    anchorEndOffset: formData.get("anchorEndOffset") ? Number(formData.get("anchorEndOffset")) : null,
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

  const isGlobal = data.targetType === "global";
  const isElement = data.targetType === "element";
  if (isGlobal || isElement || (data.x !== null && data.y !== null)) {
    const annotationValues = {
      commentId: comment.id,
      x: isGlobal ? 0 : (data.x ?? 0),
      y: isGlobal ? 0 : (data.y ?? 0),
      width: (isGlobal || isElement) ? null : (data.width ?? null),
      height: (isGlobal || isElement) ? null : (data.height ?? null),
      targetType: data.targetType ?? "point",
      iframeX: data.iframeX ?? null,
      iframeY: data.iframeY ?? null,
      selectedText: data.selectedText ?? null,
      anchorXPath: data.anchorXPath ?? null,
      anchorOffset: data.anchorOffset ?? null,
      anchorEndXPath: data.anchorEndXPath ?? null,
      anchorEndOffset: data.anchorEndOffset ?? null,
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

async function requireCommentAccess(commentId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");

  const [row] = await db
    .select({
      artifactId: schema.comments.artifactId,
      commentUserId: schema.comments.userId,
      workspaceId: schema.artifacts.workspaceId,
    })
    .from(schema.comments)
    .innerJoin(schema.artifacts, eq(schema.artifacts.id, schema.comments.artifactId))
    .where(eq(schema.comments.id, commentId))
    .limit(1);

  if (!row) throw new Error("NOT_FOUND");

  const isOwner = row.commentUserId === session.user.id;
  if (!isOwner) {
    const [member] = await db
      .select({ userId: schema.workspaceMembers.userId })
      .from(schema.workspaceMembers)
      .where(
        and(
          eq(schema.workspaceMembers.workspaceId, row.workspaceId),
          eq(schema.workspaceMembers.userId, session.user.id),
        ),
      )
      .limit(1);
    if (!member) throw new Error("FORBIDDEN");
  }

  return session;
}

// Keep old name for callers that haven't been updated yet
const requireAnnotationAccess = requireCommentAccess;

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
  await requireAnnotationAccess(data.commentId);

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

export async function deleteComment(commentId: string) {
  await requireCommentAccess(commentId);
  await db.delete(schema.comments).where(eq(schema.comments.id, commentId));
}

export async function toggleResolve(commentId: string) {
  await requireCommentAccess(commentId);
  const [current] = await db
    .select({ resolved: schema.comments.resolved })
    .from(schema.comments)
    .where(eq(schema.comments.id, commentId))
    .limit(1);
  if (!current) throw new Error("NOT_FOUND");
  await db
    .update(schema.comments)
    .set({ resolved: !current.resolved })
    .where(eq(schema.comments.id, commentId));
}

// Alias kept for callers that still reference the old name
export async function deleteAnnotation(commentId: string) {
  return deleteComment(commentId);
}

const addReplySchema = z.object({
  parentCommentId: z.string().min(1),
  body: z.string().min(1).max(2000),
  artifactId: z.string().min(1),
  workspaceSlug: z.string().optional().nullable(),
  slug: z.string().optional().nullable(),
});

export async function addReply(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  const data = addReplySchema.parse({
    parentCommentId: formData.get("parentCommentId"),
    body: formData.get("body"),
    artifactId: formData.get("artifactId"),
    workspaceSlug: formData.get("workspaceSlug") || null,
    slug: formData.get("slug") || null,
  });
  const { artifact } = await loadArtifactWithAccess(data.artifactId);
  await db.insert(schema.comments).values({
    artifactId: artifact.id,
    userId: session.user.id,
    body: data.body,
    parentCommentId: data.parentCommentId,
  });
  if (data.workspaceSlug && data.slug) revalidatePath(`/${data.workspaceSlug}/a/${data.slug}`);
  if (data.slug) revalidatePath(`/a/${data.slug}`);
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
