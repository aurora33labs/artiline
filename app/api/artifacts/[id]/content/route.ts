import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { bearerToken, resolveApiKey, guardErrorResponse } from "@/lib/tenant";
import { getContent } from "@/lib/artifact-content";

export const runtime = "nodejs";

/**
 * Token-authenticated content read, for external ingesters (e.g. Regenta's
 * artiline webhook tunnel) that only hold a workspace-scoped `artl_...` API
 * key — no session cookie. `/api/artifacts/raw/[slug]` is visibility/session
 * gated by design (it's the public viewer's content source) and deliberately
 * doesn't accept Bearer tokens; this route is the token-auth counterpart,
 * scoped to workspace members only (no public/anonymous access).
 *
 * `?v=<versionNumber>` reads a specific pinned version; omitted reads the
 * current (live) version.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const token = bearerToken(req.headers.get("authorization"));
    if (!token) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    const auth = await resolveApiKey(token);

    const [artifact] = await db
      .select()
      .from(schema.artifacts)
      .where(eq(schema.artifacts.id, id))
      .limit(1);
    // Same existence-leak guard as publishVersion: wrong workspace reads as
    // not-found, not forbidden.
    if (!artifact || artifact.workspaceId !== auth.workspace.id) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const url = new URL(req.url);
    const vParam = url.searchParams.get("v");
    const versionNumber = vParam ? Number(vParam) : null;

    const version =
      versionNumber != null && Number.isFinite(versionNumber)
        ? (
            await db
              .select()
              .from(schema.artifactVersions)
              .where(
                and(
                  eq(schema.artifactVersions.artifactId, artifact.id),
                  eq(schema.artifactVersions.versionNumber, versionNumber),
                ),
              )
              .limit(1)
          )[0]
        : artifact.currentVersionId
          ? (
              await db
                .select()
                .from(schema.artifactVersions)
                .where(eq(schema.artifactVersions.id, artifact.currentVersionId))
                .limit(1)
            )[0]
          : undefined;

    if (!version) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    if (version.type === "external") {
      // External-site artifacts have no content of their own to read.
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const content = await getContent(version);

    return NextResponse.json({
      slug: artifact.slug,
      type: version.type,
      versionNumber: version.versionNumber,
      title: version.title,
      content,
    });
  } catch (e) {
    const guard = guardErrorResponse(e);
    if (guard) return guard;
    return NextResponse.json({ error: "ERR_INTERNAL" }, { status: 500 });
  }
}
