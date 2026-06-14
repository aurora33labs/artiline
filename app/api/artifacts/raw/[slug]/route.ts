import { auth } from "@/auth";
import { evaluateAccess } from "@/lib/visibility";
import {
  resolveCurrentArtifact,
  resolveArtifactVersion,
} from "@/lib/artifact-resolve";
import { getContent } from "@/lib/artifact-content";

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

  const versionNumber = v ? Number(v) : null;
  const resolved =
    versionNumber != null && Number.isFinite(versionNumber)
      ? await resolveArtifactVersion(slug, versionNumber)
      : await resolveCurrentArtifact(slug);
  if (!resolved) return new Response("Not found", { status: 404 });

  const session = await auth();
  const access = await evaluateAccess(resolved.artifact, {
    sessionUserId: session?.user?.id ?? null,
    passwordAttempt: pw,
  });
  if (access.kind !== "ok") {
    return new Response("Forbidden", { status: 403 });
  }

  const content = await getContent(resolved.version);
  const isHtml = resolved.version.type === "html";

  // Cap browser/proxy caching for private artifacts; private content must not be
  // cached by shared caches.
  const isPublic =
    resolved.artifact.visibility === "public" ||
    resolved.artifact.visibility === "public_pw";
  const cache = isPublic
    ? "public, max-age=300"
    : "private, no-store";

  const headers: Record<string, string> = {
    "Content-Type": isHtml
      ? "text/html; charset=utf-8"
      : "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": cache,
  };
  if (isHtml) {
    // Sandbox the document at the HTTP layer so a direct navigation can't run on
    // our origin; allow-scripts keeps interactive artifacts working in the iframe.
    headers["Content-Security-Policy"] = "sandbox allow-scripts";
  } else {
    headers["Content-Security-Policy"] = "default-src 'none'; sandbox";
  }

  return new Response(content, { headers });
}

// Views are recorded by the page, not the raw stream — keep this uncached/dynamic.
export const dynamic = "force-dynamic";
