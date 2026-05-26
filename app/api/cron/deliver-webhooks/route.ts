import { NextResponse } from "next/server";
import { and, eq, lte, or, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { signPayload } from "@/lib/webhooks/sign";

export const runtime = "nodejs";
export const maxDuration = 60;

const BACKOFF_MINUTES = [1, 5, 30, 120, 720];
const MAX_ATTEMPTS = BACKOFF_MINUTES.length;
const BATCH_SIZE = 50;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const now = new Date();
  const pending = await db
    .select({
      delivery: schema.webhookDeliveries,
      webhook: schema.webhooks,
    })
    .from(schema.webhookDeliveries)
    .innerJoin(
      schema.webhooks,
      eq(schema.webhooks.id, schema.webhookDeliveries.webhookId),
    )
    .where(
      and(
        eq(schema.webhookDeliveries.status, "pending"),
        or(
          sql`${schema.webhookDeliveries.nextAttemptAt} IS NULL`,
          lte(schema.webhookDeliveries.nextAttemptAt, now),
        ),
      ),
    )
    .limit(BATCH_SIZE);

  let success = 0;
  let failed = 0;

  for (const { delivery, webhook } of pending) {
    const attempt = delivery.attempts + 1;
    const body = JSON.stringify(delivery.payload);
    const signature = signPayload(webhook.secret, body);

    try {
      const res = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-artiline-event": delivery.event,
          "x-artiline-signature": signature,
          "x-artiline-delivery-id": delivery.id,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });

      if (res.ok) {
        await db
          .update(schema.webhookDeliveries)
          .set({
            status: "success",
            attempts: attempt,
            deliveredAt: new Date(),
            lastError: null,
          })
          .where(eq(schema.webhookDeliveries.id, delivery.id));
        success += 1;
        continue;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      const lastError = (err as Error).message.slice(0, 500);
      if (attempt >= MAX_ATTEMPTS) {
        await db
          .update(schema.webhookDeliveries)
          .set({
            status: "failed",
            attempts: attempt,
            lastError,
          })
          .where(eq(schema.webhookDeliveries.id, delivery.id));
      } else {
        const delayMin = BACKOFF_MINUTES[attempt - 1] ?? 720;
        await db
          .update(schema.webhookDeliveries)
          .set({
            attempts: attempt,
            lastError,
            nextAttemptAt: new Date(Date.now() + delayMin * 60 * 1000),
          })
          .where(eq(schema.webhookDeliveries.id, delivery.id));
      }
      failed += 1;
    }
  }

  return NextResponse.json({
    processed: pending.length,
    success,
    failed,
  });
}
