import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db, schema } from "@/lib/db";
import { evaluateAccess } from "@/lib/visibility";
import {
  resolveCurrentArtifact,
  resolveArtifactVersion,
} from "@/lib/artifact-resolve";
import { getContent } from "@/lib/artifact-content";
import { extensionForArtifact, isReactRenderable } from "@/lib/detect-artifact";
import { renderReactWrapper } from "@/lib/react-wrapper";
import { slugify } from "@/lib/tenant";
import { ANNOTATION_SCRIPT, REDUCED_MOTION_FALLBACK } from "@/lib/annotation-script";

export const runtime = "nodejs";

/**
 * Streams an artifact version's raw content for the viewer iframe (and the edit
 * dialog), so the bytes never enter the page's RSC payload. Re-checks visibility
 * on every request — the same gate as the page (`evaluateAccess`). HTML is served
 * with `Content-Security-Policy: sandbox allow-scripts` so that even if the URL is
 * opened directly it runs in an opaque origin (no access to the app's cookies or
 * DOM), matching the isolation the srcDoc + sandboxed iframe gave before.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const url = new URL(req.url);
  const v = url.searchParams.get("v");
  const pw = url.searchParams.get("pw");
  const download = url.searchParams.get("download") === "1";

  const versionNumber = v ? Number(v) : null;
  const resolved =
    versionNumber != null && Number.isFinite(versionNumber)
      ? await resolveArtifactVersion(slug, versionNumber)
      : await resolveCurrentArtifact(slug);
  if (!resolved) return new Response("Not found", { status: 404 });
  // External-site artifacts have no content of their own to stream.
  if (resolved.version.type === "external") {
    return new Response("Not found", { status: 404 });
  }

  const session = await auth();

  // Download mode: serve the ORIGINAL source as a file attachment, restricted to
  // workspace members (stricter than view access — a public visitor can view but
  // not download). Membership implies view rights for any visibility.
  if (download) {
    const userId = session?.user?.id;
    if (!userId) return new Response("Forbidden", { status: 403 });
    const [member] = await db
      .select({ userId: schema.workspaceMembers.userId })
      .from(schema.workspaceMembers)
      .where(
        and(
          eq(schema.workspaceMembers.workspaceId, resolved.artifact.workspaceId),
          eq(schema.workspaceMembers.userId, userId),
        ),
      )
      .limit(1);
    if (!member) return new Response("Forbidden", { status: 403 });

    const source = await getContent(resolved.version);
    const ext = extensionForArtifact(
      resolved.version.type,
      resolved.version.language,
    );
    const name = `${slugify(resolved.version.title) || "artifact"}.${ext}`;
    return new Response(source, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${name}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  }

  const access = await evaluateAccess(resolved.artifact, {
    sessionUserId: session?.user?.id ?? null,
    passwordAttempt: pw,
  });
  if (access.kind !== "ok") {
    return new Response("Forbidden", { status: 403 });
  }

  // Un-approved (pending/changes_requested) versions are internal-only: their
  // raw bytes must never reach a public/anonymous visitor, even for a public
  // artifact. A workspace member may still view a proposal (this same route
  // backs the internal deep-link viewer).
  const isApproved = resolved.version.reviewStatus === "approved";
  if (!isApproved) {
    const userId = session?.user?.id;
    const member = userId
      ? (
          await db
            .select({ userId: schema.workspaceMembers.userId })
            .from(schema.workspaceMembers)
            .where(
              and(
                eq(
                  schema.workspaceMembers.workspaceId,
                  resolved.artifact.workspaceId,
                ),
                eq(schema.workspaceMembers.userId, userId),
              ),
            )
            .limit(1)
        )[0]
      : null;
    if (!member) return new Response("Forbidden", { status: 403 });
  }

  const content = await getContent(resolved.version);
  const isHtml = resolved.version.type === "html";
  const isReact = isReactRenderable(
    resolved.version.type,
    resolved.version.language,
  );
  // React artifacts are wrapped in a self-contained HTML doc that transpiles and
  // mounts the component; both it and HTML are served as a sandboxed document.
  const serveAsDocument = isHtml || isReact;
  let body = isReact ? renderReactWrapper(content) : content;

  if (serveAsDocument) {
    // Case-insensitive match + fallback append for HTML fragments without </body>
    const inject = REDUCED_MOTION_FALLBACK + ANNOTATION_SCRIPT;
    if (/<\/body>/i.test(body)) {
      body = body.replace(/<\/body>/i, inject + "</body>");
    } else {
      body = body + inject;
    }
  }

  // Cap browser/proxy caching for private artifacts; private content must not be
  // cached by shared caches.
  const isPublic =
    resolved.artifact.visibility === "public" ||
    resolved.artifact.visibility === "public_pw";
  // A versioned request (`?v=N`) is immutable content at a unique URL, so a
  // strictly-public one can be cached hard — new versions get a new URL and bust
  // it. Password-gated (`public_pw`) is never cached long by shared caches, and
  // internal stays uncached.
  const cache = !isApproved
    ? // Never let a shared cache hold an un-approved proposal.
      "private, no-store"
    : versionNumber != null && resolved.artifact.visibility === "public"
      ? "public, max-age=31536000, immutable"
      : isPublic
        ? "public, max-age=300"
        : "private, no-store";

  const headers: Record<string, string> = {
    "Content-Type": serveAsDocument
      ? "text/html; charset=utf-8"
      : "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": cache,
  };
  if (serveAsDocument) {
    // Sandbox the document at the HTTP layer so a direct navigation can't run on
    // our origin; allow-scripts keeps interactive artifacts working in the iframe.
    // frame-ancestors * is required here (not restricted via next.config headers())
    // because when /embed/[slug] is itself embedded in a third-party site, this
    // raw document sits one level deeper in that same external ancestor chain.
    headers["Content-Security-Policy"] = "sandbox allow-scripts; frame-ancestors *";
  } else {
    headers["Content-Security-Policy"] = "default-src 'none'; sandbox";
  }

  return new Response(body, { headers });
}

// Views are recorded by the page, not the raw stream — keep this uncached/dynamic.
export const dynamic = "force-dynamic";
