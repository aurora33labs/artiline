import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMemberOrToken, guardErrorResponse } from "@/lib/tenant";
import { MAX_CONTENT_BYTES } from "@/lib/artifact-content";
import { proposeVersion } from "@/lib/artifacts/propose-version";

export const runtime = "nodejs";

/**
 * Propose a new version of an artifact (re-upload) for review. Like the versions
 * route but any workspace member may call it — the version lands as `pending`
 * and does NOT go live. A Route Handler (not a server action) so large files
 * aren't capped by serverActions.bodySizeLimit behind the proxy.
 */
const proposalSchema = z.object({
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
    const data = proposalSchema.parse({
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

    const { slug, versionNumber } = await proposeVersion(auth, id, {
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
