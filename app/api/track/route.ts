import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { isFeatureEnabled } from "@/lib/license";

export const runtime = "nodejs";

const beaconSchema = z.object({
  artifactId: z.string().min(1),
  versionId: z.string().min(1),
  sessionId: z.string().min(1).max(64),
  dwellMs: z.number().int().nonnegative().max(86400000),
  scrollDepth: z.number().int().min(0).max(100),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = beaconSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  const data = parsed.data;

  // Lookup artifact → workspace to gate by feature flag
  const [artifact] = await db
    .select({ workspaceId: schema.artifacts.workspaceId })
    .from(schema.artifacts)
    .where(eq(schema.artifacts.id, data.artifactId))
    .limit(1);
  if (!artifact) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  if (
    !(await isFeatureEnabled("tracking_advanced", {
      workspaceId: artifact.workspaceId,
    }))
  ) {
    // Silently accept beacon so client doesn't retry, but don't persist
    return NextResponse.json({ ok: true, persisted: false });
  }

  // Geo from Cloudflare / Vercel headers, best-effort
  const country =
    req.headers.get("cf-ipcountry") ?? req.headers.get("x-vercel-ip-country");

  // Update the most recent view_event for (artifact, version, session)
  const [existing] = await db
    .select()
    .from(schema.viewEvents)
    .where(
      and(
        eq(schema.viewEvents.artifactId, data.artifactId),
        eq(schema.viewEvents.versionId, data.versionId),
        eq(schema.viewEvents.sessionId, data.sessionId),
      ),
    )
    .orderBy(desc(schema.viewEvents.createdAt))
    .limit(1);

  if (existing) {
    await db
      .update(schema.viewEvents)
      .set({
        dwellMs: data.dwellMs,
        scrollDepth: data.scrollDepth,
        country: country ?? existing.country,
      })
      .where(eq(schema.viewEvents.id, existing.id));
  }

  return NextResponse.json({ ok: true, persisted: true });
}
