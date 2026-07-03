import { z } from "zod";
import {
  checkOrigin,
  checkReviewRateLimit,
  recordPageHash,
  resolveSiteByKey,
  reviewCorsHeaders,
} from "@/lib/external-reviews";
import { extractIp } from "@/lib/tracking";

export const runtime = "nodejs";

const pingSchema = z.object({
  key: z.string().min(1).max(100),
  path: z.string().min(1).max(500).startsWith("/"),
  hash: z.string().min(1).max(64),
  title: z.string().max(200).optional().nullable(),
});

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return new Response(null, { status: 204 });
  return new Response(null, { status: 204, headers: reviewCorsHeaders(origin) });
}

export async function POST(req: Request) {
  let data: z.infer<typeof pingSchema>;
  try {
    data = pingSchema.parse(await req.json());
  } catch {
    return Response.json({ error: "ERR_INVALID" }, { status: 400 });
  }

  const ctx = await resolveSiteByKey(data.key);
  if (!ctx) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!checkOrigin(req, ctx.site)) {
    // No CORS headers on a rejected origin — the browser just blocks it.
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const ip = extractIp(req.headers);
  if (await checkReviewRateLimit("review_ping", ctx.artifact.id, ip)) {
    return Response.json(
      { error: "RATE_LIMITED" },
      { status: 429, headers: reviewCorsHeaders(req.headers.get("origin")!) },
    );
  }

  await recordPageHash({
    artifactId: ctx.artifact.id,
    workspaceId: ctx.artifact.workspaceId,
    path: data.path,
    hash: data.hash,
    title: data.title,
  });

  return Response.json(
    { ok: true },
    { headers: reviewCorsHeaders(req.headers.get("origin")!) },
  );
}
