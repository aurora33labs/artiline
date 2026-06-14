import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { auth } from "@/auth";
import { evaluateAccess } from "@/lib/visibility";
import { htmlToPng } from "@/lib/export/html-to-png";
import { getContent } from "@/lib/artifact-content";
import { r2Configured, uploadObject, publicOrPresignedUrl } from "@/lib/r2";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ artifactId: string }> },
) {
  const { artifactId } = await ctx.params;
  const url = new URL(req.url);
  const vParam = url.searchParams.get("v");
  const versionNumber = vParam ? Number.parseInt(vParam, 10) : null;

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

  let version: typeof schema.artifactVersions.$inferSelect | null = null;
  if (versionNumber && Number.isFinite(versionNumber) && versionNumber > 0) {
    const [pinned] = await db
      .select()
      .from(schema.artifactVersions)
      .where(
        and(
          eq(schema.artifactVersions.artifactId, artifact!.id),
          eq(schema.artifactVersions.versionNumber, versionNumber),
        ),
      )
      .limit(1);
    version = pinned ?? null;
  } else if (artifact!.currentVersionId) {
    const [current] = await db
      .select()
      .from(schema.artifactVersions)
      .where(eq(schema.artifactVersions.id, artifact!.currentVersionId))
      .limit(1);
    version = current ?? null;
  }

  if (!version) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (version.type !== "html") {
    return NextResponse.json({ error: "ERR_EXPORT_HTML_ONLY" }, { status: 400 });
  }
  if (!r2Configured()) {
    return NextResponse.json(
      { error: "ERR_EXPORT_R2_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const png = await htmlToPng(await getContent(version));
  const key = `exports/${artifact!.id}/v${version.versionNumber}-${Date.now()}.png`;
  await uploadObject(key, png, "image/png");

  await db.insert(schema.artifactExports).values({
    artifactId: artifact!.id,
    format: "png",
    r2Key: key,
  });

  const publicUrl = await publicOrPresignedUrl(key);
  return NextResponse.json({ url: publicUrl });
}
