import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { currentEdition } from "@/lib/license";
import { requireMember, requireRole, guardErrorResponse } from "@/lib/tenant";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (currentEdition() !== "cloud") {
    return NextResponse.json({ error: "OSS_EDITION" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    workspaceSlug?: string;
  };
  if (!body.workspaceSlug) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const guard = await requireMember(body.workspaceSlug)
    .then((m) => {
      requireRole(m.role, ["owner", "admin"]);
      return m;
    })
    .catch((e: unknown) => guardErrorResponse(e) ?? Promise.reject(e));
  if (guard instanceof NextResponse) return guard;
  const { workspace } = guard;

  const [sub] = await db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.workspaceId, workspace.id))
    .limit(1);
  if (!sub) {
    return NextResponse.json({ error: "NO_SUBSCRIPTION" }, { status: 404 });
  }

  const { getStripe } = await import("@/lib/cloud/stripe");
  const origin = new URL(req.url).origin;
  const stripe = getStripe();
  const portal = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${origin}/${workspace.slug}/billing`,
  });

  return NextResponse.json({ url: portal.url });
}
