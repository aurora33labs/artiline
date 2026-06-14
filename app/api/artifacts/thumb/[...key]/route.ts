import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { auth } from "@/auth";
import { evaluateAccess } from "@/lib/visibility";
import { getObject, r2Configured } from "@/lib/r2";

export const runtime = "nodejs";

/**
 * Serves a dashboard thumbnail PNG. The key is `thumbs/<versionId>.png`, so we
 * resolve the version → artifact and re-check visibility on every request (the
 * same gate as the page). Always a PNG, served with image-only hardening.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ key: string[] }> },
) {
  const { key } = await ctx.params;
  if (key[0] !== "thumbs" || key.length !== 2) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (!r2Configured()) {
    return NextResponse.json({ error: "NO_STORAGE" }, { status: 404 });
  }
  const versionId = key[1].replace(/\.png$/, "");

  const [row] = await db
    .select({ artifact: schema.artifacts })
    .from(schema.artifactVersions)
    .innerJoin(
      schema.artifacts,
      eq(schema.artifacts.id, schema.artifactVersions.artifactId),
    )
    .where(eq(schema.artifactVersions.id, versionId))
    .limit(1);

  const session = await auth();
  const access = await evaluateAccess(row?.artifact ?? null, {
    sessionUserId: session?.user?.id ?? null,
    passwordAttempt: null,
  });
  if (access.kind !== "ok") {
    return NextResponse.json({ error: access.kind }, { status: 403 });
  }

  try {
    const { body } = await getObject(`thumbs/${versionId}.png`);
    return new NextResponse(new Blob([new Uint8Array(body)], { type: "image/png" }), {
      headers: {
        "Content-Type": "image/png",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
}
