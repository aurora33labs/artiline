import { NextResponse } from "next/server";
import { currentEdition } from "@/lib/license";
import { requireMember, requireRole } from "@/lib/tenant";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (currentEdition() !== "cloud") {
    return NextResponse.json({ error: "OSS_EDITION" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    workspaceSlug?: string;
    tier?: "studio" | "agency" | "agency_plus";
  };
  if (!body.workspaceSlug || !body.tier) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const { workspace, role } = await requireMember(body.workspaceSlug);
  requireRole(role, ["owner", "admin"]);

  const { getStripe } = await import("@/lib/cloud/stripe");
  const { stripePriceId } = await import("@/lib/cloud/pricing");
  const priceId = stripePriceId(body.tier);
  if (!priceId) {
    return NextResponse.json(
      { error: "PRICE_NOT_CONFIGURED" },
      { status: 500 },
    );
  }

  const origin = new URL(req.url).origin;
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/${workspace.slug}/billing?success=1`,
    cancel_url: `${origin}/${workspace.slug}/billing?canceled=1`,
    client_reference_id: workspace.id,
    metadata: { workspaceId: workspace.id, tier: body.tier },
  });

  return NextResponse.json({ url: session.url });
}
