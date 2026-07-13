import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  requireMemberOrToken,
  requireRole,
  requireApiKey,
  bearerToken,
  guardErrorResponse,
} from "@/lib/tenant";
import { db, schema } from "@/lib/db";
import { MAX_CONTENT_BYTES } from "@/lib/artifact-content";
import { createArtifact } from "@/lib/artifacts/create";

export const runtime = "nodejs";

const LIST_PAGE_SIZE = 50;

/**
 * Listado estructurado (JSON) de artifacts de un workspace, token-auth
 * `artl_...` — para integraciones externas que necesitan enumerar TODO
 * (ej. reconciliación de Regenta), a diferencia del tool MCP `list_artifacts`
 * (texto para humanos, tope de 100, sin id). Cursor por (updatedAt, id) desc
 * — id es nanoid, no ordenable por sí solo, sirve como desempate estable.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const workspaceSlug = url.searchParams.get("workspaceSlug");
    if (!workspaceSlug) {
      return NextResponse.json({ error: "ERR_INVALID" }, { status: 400 });
    }
    const auth = await requireApiKey(workspaceSlug, bearerToken(req.headers.get("authorization")) ?? "");

    const cursorUpdatedAt = url.searchParams.get("cursorUpdatedAt");
    const cursorId = url.searchParams.get("cursorId");
    const cursorCondition =
      cursorUpdatedAt && cursorId
        ? sql`(${schema.artifacts.updatedAt}, ${schema.artifacts.id}) < (${new Date(cursorUpdatedAt)}, ${cursorId})`
        : undefined;

    const rows = await db
      .select({
        id: schema.artifacts.id,
        slug: schema.artifacts.slug,
        updatedAt: schema.artifacts.updatedAt,
        type: schema.artifactVersions.type,
        currentVersionNumber: schema.artifactVersions.versionNumber,
      })
      .from(schema.artifacts)
      .leftJoin(schema.artifactVersions, eq(schema.artifactVersions.id, schema.artifacts.currentVersionId))
      .where(
        cursorCondition
          ? and(eq(schema.artifacts.workspaceId, auth.workspace.id), cursorCondition)
          : eq(schema.artifacts.workspaceId, auth.workspace.id),
      )
      .orderBy(desc(schema.artifacts.updatedAt), desc(schema.artifacts.id))
      .limit(LIST_PAGE_SIZE + 1);

    const hasMore = rows.length > LIST_PAGE_SIZE;
    const page = rows.slice(0, LIST_PAGE_SIZE);
    const last = page[page.length - 1];

    return NextResponse.json({
      artifacts: page.map((r) => ({
        id: r.id,
        slug: r.slug,
        type: r.type,
        currentVersionNumber: r.currentVersionNumber,
        updatedAt: r.updatedAt,
      })),
      nextCursor: hasMore && last ? { cursorUpdatedAt: last.updatedAt.toISOString(), cursorId: last.id } : null,
    });
  } catch (e) {
    const guard = guardErrorResponse(e);
    if (guard) return guard;
    return NextResponse.json({ error: "ERR_INTERNAL" }, { status: 500 });
  }
}

/**
 * Create an artifact. This is a Route Handler (not a Server Action) on purpose:
 * `/api/*` is excluded from the proxy rewrite, and route handlers aren't bound by
 * `serverActions.bodySizeLimit` (which silently reverts to 1 MB behind the proxy
 * on some deployments). So large artifacts upload reliably on any domain. We
 * enforce our own body cap here instead.
 *
 * Accepts either a session cookie or an `Authorization: Bearer artl_...` API
 * token (see `requireMemberOrToken`), so programmatic clients (e.g. the MCP
 * server) hit the same code path as the in-app upload form.
 */
const createSchema = z.object({
  workspaceSlug: z.string().min(1),
  type: z.enum(["html", "markdown", "code"]),
  title: z.string().trim().min(1).max(200),
  content: z.string().min(1),
  language: z.string().max(50).optional().nullable(),
  visibility: z.enum(["internal_pw", "internal", "public_pw", "public"]),
  password: z.string().optional().nullable(),
  cleanShare: z.string().optional().nullable(),
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
      cleanShare: form.get("cleanShare") || null,
    });

    const ctx = await requireMemberOrToken(
      data.workspaceSlug,
      req.headers.get("authorization"),
    );
    requireRole(ctx.role, ["owner", "admin", "member"]);

    const { slug } = await createArtifact(ctx, {
      type: data.type,
      title: data.title,
      content: data.content,
      language: data.language,
      visibility: data.visibility,
      password: data.password,
      cleanShare: !!data.cleanShare,
    });

    return NextResponse.json({ slug });
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
    if (msg === "ERR_PASSWORD_TOO_SHORT") {
      return NextResponse.json(
        { error: "ERR_PASSWORD_TOO_SHORT" },
        { status: 400 },
      );
    }
    if (msg === "LIMIT_ARTIFACTS")
      return NextResponse.json({ error: "LIMIT_ARTIFACTS" }, { status: 403 });
    return NextResponse.json({ error: "ERR_INTERNAL" }, { status: 500 });
  }
}
