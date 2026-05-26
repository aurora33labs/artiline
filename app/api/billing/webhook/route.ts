import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { currentEdition } from "@/lib/license";

export const runtime = "nodejs";

type SubscriptionStatus = (typeof schema.subscriptionStatusEnum.enumValues)[number];

function mapStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  if (status === "unpaid") return "past_due";
  return status as SubscriptionStatus;
}

export async function POST(req: Request) {
  if (currentEdition() !== "cloud") {
    return NextResponse.json({ error: "OSS_EDITION" }, { status: 404 });
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "WEBHOOK_SECRET_MISSING" },
      { status: 500 },
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "NO_SIGNATURE" }, { status: 400 });
  }

  const rawBody = await req.text();
  const { getStripe } = await import("@/lib/cloud/stripe");
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (e) {
    return NextResponse.json(
      { error: "BAD_SIGNATURE", detail: (e as Error).message },
      { status: 400 },
    );
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const workspaceId =
        session.client_reference_id ?? session.metadata?.workspaceId ?? null;
      const tier = session.metadata?.tier ?? null;
      if (workspaceId && tier && session.customer && session.subscription) {
        await db
          .insert(schema.subscriptions)
          .values({
            workspaceId,
            stripeCustomerId: String(session.customer),
            stripeSubscriptionId: String(session.subscription),
            tier,
            status: "active",
            currentPeriodEnd: null,
          })
          .onConflictDoUpdate({
            target: schema.subscriptions.workspaceId,
            set: {
              stripeCustomerId: String(session.customer),
              stripeSubscriptionId: String(session.subscription),
              tier,
              status: "active",
              updatedAt: new Date(),
            },
          });
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const workspaceId =
        sub.metadata?.workspaceId ?? null;
      if (workspaceId) {
        const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end;
        await db
          .update(schema.subscriptions)
          .set({
            status: mapStatus(sub.status),
            currentPeriodEnd: periodEnd
              ? new Date(periodEnd * 1000)
              : null,
            updatedAt: new Date(),
          })
          .where(eq(schema.subscriptions.workspaceId, workspaceId));
      }
      break;
    }
    default:
      // ignore unhandled
      break;
  }

  return NextResponse.json({ received: true });
}
