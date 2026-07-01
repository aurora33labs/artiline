import { NextResponse } from "next/server";
import { z } from "zod";
import {
  requireMemberOrToken,
  requireRole,
  guardErrorResponse,
} from "@/lib/tenant";
import { MAX_CONTENT_BYTES } from "@/lib/artifact-content";
import { createArtifact } from "@/lib/artifacts/create";

export const runtime = "nodejs";

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
