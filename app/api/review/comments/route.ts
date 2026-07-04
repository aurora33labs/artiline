import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { emitEvent } from "@/lib/webhooks/emit";
import { recordEvent } from "@/lib/activity";
import { extractIp } from "@/lib/tracking";
import {
  checkOrigin,
  checkReviewRateLimit,
  recordPageHash,
  resolveSiteByKey,
  reviewCorsHeaders,
} from "@/lib/external-reviews";

export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return new Response(null, { status: 204 });
  return new Response(null, { status: 204, headers: reviewCorsHeaders(origin) });
}

const postSchema = z.object({
  key: z.string().min(1).max(100),
  path: z.string().min(1).max(500).startsWith("/"),
  hash: z.string().max(64).optional().nullable(),
  body: z.string().min(1).max(2000),
  authorName: z.string().max(80),
  targetType: z.enum(["element", "global"]),
  anchorXPath: z.string().max(1000).optional().nullable(),
  x: z.number().min(0).max(1).optional().nullable(),
  y: z.number().min(0).max(1).optional().nullable(),
});

export async function POST(req: Request) {
  let data: z.infer<typeof postSchema>;
  try {
    data = postSchema.parse(await req.json());
  } catch {
    return Response.json({ error: "ERR_INVALID" }, { status: 400 });
  }

  const ctx = await resolveSiteByKey(data.key);
  if (!ctx) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!checkOrigin(req, ctx.site)) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const origin = req.headers.get("origin")!;

  const ip = extractIp(req.headers);
  if (await checkReviewRateLimit("review_comment", ctx.artifact.id, ip)) {
    return Response.json(
      { error: "RATE_LIMITED" },
      { status: 429, headers: reviewCorsHeaders(origin) },
    );
  }

  if (data.hash) {
    await recordPageHash({
      artifactId: ctx.artifact.id,
      workspaceId: ctx.artifact.workspaceId,
      path: data.path,
      hash: data.hash,
    });
  }

  const [comment] = await db
    .insert(schema.comments)
    .values({
      artifactId: ctx.artifact.id,
      versionId: ctx.artifact.currentVersionId,
      userId: null,
      authorName: data.authorName || "Anónimo",
      body: data.body,
      pageUrl: data.path,
    })
    .returning({ id: schema.comments.id });

  await db.insert(schema.annotations).values({
    commentId: comment.id,
    x: data.targetType === "global" ? 0 : (data.x ?? 0),
    y: data.targetType === "global" ? 0 : (data.y ?? 0),
    targetType: data.targetType,
    anchorXPath: data.targetType === "element" ? (data.anchorXPath ?? null) : null,
  });

  await emitEvent(ctx.artifact.workspaceId, "comment.created", {
    artifactId: ctx.artifact.id,
    authorName: data.authorName,
    body: data.body,
    path: data.path,
  }).catch(() => {});
  await recordEvent({
    workspaceId: ctx.artifact.workspaceId,
    actorUserId: null,
    type: "comment.created",
    subjectType: "comment",
    subjectId: comment.id,
    payload: { slug: ctx.artifact.slug, authorName: data.authorName, path: data.path },
  }).catch(() => {});

  return Response.json({ ok: true }, { headers: reviewCorsHeaders(origin) });
}

const getSchema = z.object({
  key: z.string().min(1).max(100),
  path: z.string().min(1).max(500),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  let data: z.infer<typeof getSchema>;
  try {
    data = getSchema.parse({
      key: url.searchParams.get("key"),
      path: url.searchParams.get("path"),
    });
  } catch {
    return Response.json({ error: "ERR_INVALID" }, { status: 400 });
  }

  const ctx = await resolveSiteByKey(data.key);
  if (!ctx) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!checkOrigin(req, ctx.site)) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const origin = req.headers.get("origin")!;

  // Bodies are intentionally never returned here — the public key is meant to
  // be embeddable in the client's HTML, so anyone holding it could otherwise
  // read the team's internal comment threads. Pins only.
  const rows = await db
    .select({
      commentId: schema.comments.id,
      targetType: schema.annotations.targetType,
      anchorXPath: schema.annotations.anchorXPath,
      x: schema.annotations.x,
      y: schema.annotations.y,
      resolved: schema.comments.resolved,
      staleAt: schema.annotations.staleAt,
    })
    .from(schema.comments)
    .innerJoin(schema.annotations, eq(schema.annotations.commentId, schema.comments.id))
    .where(
      and(
        eq(schema.comments.artifactId, ctx.artifact.id),
        eq(schema.comments.pageUrl, data.path),
        isNull(schema.comments.parentCommentId),
      ),
    );

  const pins = rows.map((r) => ({
    commentId: r.commentId,
    targetType: r.targetType,
    anchorXPath: r.anchorXPath,
    x: r.x,
    y: r.y,
    resolved: r.resolved,
    stale: r.staleAt != null,
  }));

  return Response.json({ pins, total: pins.length }, { headers: reviewCorsHeaders(origin) });
}
