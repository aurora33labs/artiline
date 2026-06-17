import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { requireMember, guardErrorResponse } from "@/lib/tenant";
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

export const runtime = "nodejs";

/**
 * Publish a new version by re-uploading the artifact. A Route Handler (not a
 * server action) so large files aren't capped by serverActions.bodySizeLimit
 * behind the proxy. The new version goes live immediately (approved + current),
 * and history is pruned to the workspace's maxVersions.
 */
const versionSchema = z.object({
  workspaceSlug: z.string().min(1),
  type: z.enum(["html", "markdown", "code"]),
  title: z.string().trim().min(1).max(200),
  content: z.string().min(1),
  language: z.string().max(50).optional().nullable(),
  message: z.string().max(500).optional().nullable(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const form = await req.formData();
    const data = versionSchema.parse({
      workspaceSlug: form.get("workspaceSlug"),
      type: form.get("type"),
      title: form.get("title"),
      content: form.get("content"),
      language: form.get("language") || null,
      message: form.get("message") || null,
    });

    if (Buffer.byteLength(data.content, "utf8") > MAX_CONTENT_BYTES) {
      return NextResponse.json(
        { error: "ERR_CONTENT_TOO_LARGE", maxBytes: MAX_CONTENT_BYTES },
        { status: 413 },
      );
    }

    const { session, workspace, role } = await requireMember(data.workspaceSlug);

    const [artifact] = await db
      .select()
      .from(schema.artifacts)
      .where(eq(schema.artifacts.id, id))
      .limit(1);
    if (!artifact || artifact.workspaceId !== workspace.id) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    const isAuthor = artifact.authorUserId === session.user.id;
    const isManager = role === "owner" || role === "admin";
    if (!isAuthor && !isManager) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

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
        // Re-upload goes live immediately.
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

    const reactThumb = isReactRenderable(data.type, data.language);
    if (data.type === "html" || reactThumb) {
      void generateThumbnail(versionId, data.content, { react: reactThumb })
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
      payload: { slug: artifact.slug, versionNumber: nextNumber, title: data.title },
    }).catch(() => {});

    return NextResponse.json({ versionNumber: nextNumber, slug: artifact.slug });
  } catch (e) {
    const guard = guardErrorResponse(e);
    if (guard) return guard;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "ERR_INVALID" }, { status: 400 });
    }
    return NextResponse.json({ error: "ERR_INTERNAL" }, { status: 500 });
  }
}
