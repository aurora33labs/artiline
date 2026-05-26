import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const host = url.searchParams.get("host");
  if (!host) return NextResponse.json({}, { status: 400 });

  const [row] = await db
    .select({
      slug: schema.workspaces.slug,
    })
    .from(schema.workspaceDomains)
    .innerJoin(
      schema.workspaces,
      eq(schema.workspaces.id, schema.workspaceDomains.workspaceId),
    )
    .where(
      and(
        eq(schema.workspaceDomains.hostname, host),
        eq(schema.workspaceDomains.status, "verified"),
      ),
    )
    .limit(1);

  if (!row) return NextResponse.json({});
  return NextResponse.json({ slug: row.slug });
}
