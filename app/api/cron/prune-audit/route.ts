import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const { pruneAuditEvents } = await import("@/lib/cloud/audit-retention");
  const result = await pruneAuditEvents();
  return NextResponse.json(result);
}
