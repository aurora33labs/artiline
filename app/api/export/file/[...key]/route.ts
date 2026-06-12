import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { auth } from "@/auth";
import { evaluateAccess } from "@/lib/visibility";
import { getObject, r2Configured } from "@/lib/r2";

export const runtime = "nodejs";

/**
 * Streams an exported file back to the browser. Used when the storage backend
 * (self-hosted MinIO, etc) is only reachable over the private network and can't
 * serve a browser-facing presigned URL. The artifact id is embedded in the key
 * (`exports/<artifactId>/...`), so we re-check visibility on every request.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ key: string[] }> },
) {
  const { key } = await ctx.params;
  if (key[0] !== "exports" || key.length < 3) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  const objectKey = key.join("/");
  const artifactId = key[1];

  const [artifact] = await db
    .select()
    .from(schema.artifacts)
    .where(eq(schema.artifacts.id, artifactId))
    .limit(1);

  const session = await auth();
  const access = await evaluateAccess(artifact ?? null, {
    sessionUserId: session?.user?.id ?? null,
    passwordAttempt: null,
  });
  if (access.kind !== "ok") {
    return NextResponse.json({ error: access.kind }, { status: 403 });
  }
  if (!r2Configured()) {
    return NextResponse.json(
      { error: "ERR_EXPORT_R2_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const { body, contentType } = await getObject(objectKey);
  // Never trust the stored Content-Type: constrain to an allowlist of safe
  // export types so a non-image object can't be served as executable HTML on
  // our own origin. Anything else degrades to an opaque download.
  const SAFE_TYPES = new Set([
    "image/png",
    "image/jpeg",
    "image/webp",
    "application/pdf",
  ]);
  const safeType = SAFE_TYPES.has(contentType)
    ? contentType
    : "application/octet-stream";
  // Filenames are server-generated, but sanitize defensively to keep CR/LF and
  // quotes out of the header value.
  const safeName = key[key.length - 1].replace(/[^A-Za-z0-9._-]/g, "_");
  return new NextResponse(new Blob([new Uint8Array(body)], { type: safeType }), {
    headers: {
      "Content-Type": safeType,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename="${safeName}"`,
    },
  });
}
