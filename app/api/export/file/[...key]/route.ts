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
  return new NextResponse(new Blob([new Uint8Array(body)], { type: contentType }), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename="${key[key.length - 1]}"`,
    },
  });
}
