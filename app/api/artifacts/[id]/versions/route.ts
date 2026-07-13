import { NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { requireMemberOrToken, requireApiKey, bearerToken, guardErrorResponse } from "@/lib/tenant";
import { db, schema } from "@/lib/db";
import { MAX_CONTENT_BYTES } from "@/lib/artifact-content";
import { publishVersion } from "@/lib/artifacts/publish-version";

export const runtime = "nodejs";

/**
 * Listado estructurado (JSON) de TODAS las versiones de un artifact, token-auth
 * `artl_...` — para reconciliación externa (Regenta). El tool MCP `list_versions`
 * es texto para humanos y se busca por slug, no por id; este endpoint es su
 * contraparte programática por id, hermano de GET /api/artifacts/[id]/content.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const workspaceSlug = url.searchParams.get("workspaceSlug");
    if (!workspaceSlug) {
      return NextResponse.json({ error: "ERR_INVALID" }, { status: 400 });
    }
    const auth = await requireApiKey(workspaceSlug, bearerToken(req.headers.get("authorization")) ?? "");

    const [artifact] = await db.select().from(schema.artifacts).where(eq(schema.artifacts.id, id)).limit(1);
    if (!artifact || artifact.workspaceId !== auth.workspace.id) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const versions = await db
      .select({
        versionNumber: schema.artifactVersions.versionNumber,
        type: schema.artifactVersions.type,
        createdAt: schema.artifactVersions.createdAt,
      })
      .from(schema.artifactVersions)
      .where(eq(schema.artifactVersions.artifactId, id))
      .orderBy(desc(schema.artifactVersions.versionNumber));

    return NextResponse.json({ slug: artifact.slug, versions });
  } catch (e) {
    const guard = guardErrorResponse(e);
    if (guard) return guard;
    return NextResponse.json({ error: "ERR_INTERNAL" }, { status: 500 });
  }
}

/**
 * Publish a new version by re-uploading the artifact. A Route Handler (not a
 * server action) so large files aren't capped by serverActions.bodySizeLimit
 * behind the proxy. The new version goes live immediately (approved + current),
 * and history is pruned to the workspace's maxVersions.
 *
 * Accepts a session cookie or an `Authorization: Bearer artl_...` API token.
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

    const auth = await requireMemberOrToken(
      data.workspaceSlug,
      req.headers.get("authorization"),
    );

    const { slug, versionNumber } = await publishVersion(auth, id, {
      type: data.type,
      title: data.title,
      content: data.content,
      language: data.language,
      message: data.message,
    });

    return NextResponse.json({ versionNumber, slug });
  } catch (e) {
    const guard = guardErrorResponse(e);
    if (guard) return guard;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "ERR_INVALID" }, { status: 400 });
    }
    const msg = (e as Error)?.message;
    if (msg === "ERR_CONTENT_TOO_LARGE") {
      return NextResponse.json(
        { error: "ERR_CONTENT_TOO_LARGE", maxBytes: MAX_CONTENT_BYTES },
        { status: 413 },
      );
    }
    if (msg === "NOT_FOUND")
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    if (msg === "FORBIDDEN")
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    return NextResponse.json({ error: "ERR_INTERNAL" }, { status: 500 });
  }
}
