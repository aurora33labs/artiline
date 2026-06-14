import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import bcrypt from "bcryptjs";
import { requireMember, requireRole, guardErrorResponse } from "@/lib/tenant";
import { assertCanCreateArtifact } from "@/lib/limits";
import {
  MAX_CONTENT_BYTES,
  newVersionId,
  prepareContent,
} from "@/lib/artifact-content";
import { generateThumbnail } from "@/lib/artifact-thumb-gen";
import { recordEvent } from "@/lib/activity";

export const runtime = "nodejs";

/**
 * Create an artifact. This is a Route Handler (not a Server Action) on purpose:
 * `/api/*` is excluded from the proxy rewrite, and route handlers aren't bound by
 * `serverActions.bodySizeLimit` (which silently reverts to 1 MB behind the proxy
 * on some deployments). So large artifacts upload reliably on any domain. We
 * enforce our own body cap here instead.
 */
const createSchema = z.object({
  workspaceSlug: z.string().min(1),
  type: z.enum(["html", "markdown", "code"]),
  title: z.string().trim().min(1).max(200),
  content: z.string().min(1),
  language: z.string().max(50).optional().nullable(),
  visibility: z.enum(["internal_pw", "internal", "public_pw", "public"]),
  password: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const data = createSchema.parse({
      workspaceSlug: form.get("workspaceSlug"),
      type: form.get("type"),
      title: form.get("title"),
      content: form.get("content"),
      language: form.get("language") || null,
      visibility: form.get("visibility"),
      password: form.get("password") || null,
    });

    if (Buffer.byteLength(data.content, "utf8") > MAX_CONTENT_BYTES) {
      return NextResponse.json(
        { error: "ERR_CONTENT_TOO_LARGE", maxBytes: MAX_CONTENT_BYTES },
        { status: 413 },
      );
    }

    const { session, workspace, role } = await requireMember(data.workspaceSlug);
    requireRole(role, ["owner", "admin", "member"]);
    await assertCanCreateArtifact(workspace.id);

    const needsPw =
      data.visibility === "internal_pw" || data.visibility === "public_pw";
    if (needsPw && (!data.password || data.password.length < 4)) {
      return NextResponse.json(
        { error: "ERR_PASSWORD_TOO_SHORT" },
        { status: 400 },
      );
    }
    const passwordHash =
      needsPw && data.password ? await bcrypt.hash(data.password, 10) : null;

    const versionId = newVersionId();
    const prepared = await prepareContent(versionId, data.content, data.type);

    const created = await db.transaction(async (tx) => {
      const [artifact] = await tx
        .insert(schema.artifacts)
        .values({
          workspaceId: workspace.id,
          authorUserId: session.user.id,
          slug: nanoid(10),
          visibility: data.visibility,
          passwordHash,
        })
        .returning();

      await tx.insert(schema.artifactVersions).values({
        id: versionId,
        artifactId: artifact.id,
        versionNumber: 1,
        type: data.type,
        content: prepared.content,
        contentKey: prepared.contentKey,
        contentSnippet: prepared.contentSnippet,
        contentBytes: prepared.contentBytes,
        language: data.language,
        title: data.title,
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
      payload: { slug: created.slug, title: data.title, type: data.type },
    }).catch(() => {});

    // Fire-and-forget thumbnail (HTML only, best-effort). The container is
    // long-lived (not serverless), so this completes after the response.
    if (data.type === "html") {
      void generateThumbnail(versionId, data.content).then((thumbKey) => {
        if (!thumbKey) return;
        return db
          .update(schema.artifactVersions)
          .set({ thumbKey })
          .where(eq(schema.artifactVersions.id, versionId));
      }).catch(() => {});
    }

    return NextResponse.json({ slug: created.slug });
  } catch (e) {
    const guard = guardErrorResponse(e);
    if (guard) return guard;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "ERR_INVALID" }, { status: 400 });
    }
    const msg = (e as Error)?.message;
    if (msg === "LIMIT_ARTIFACTS")
      return NextResponse.json({ error: "LIMIT_ARTIFACTS" }, { status: 403 });
    return NextResponse.json({ error: "ERR_INTERNAL" }, { status: 500 });
  }
}
