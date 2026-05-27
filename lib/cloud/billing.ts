import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { LicenseTier } from "@/lib/features";

const ACTIVE_STATUSES = new Set([
  "trialing",
  "active",
  "past_due", // grace period: keep tier active until canceled
]);

/**
 * Resolve current tier for a workspace based on its Stripe subscription record.
 *
 * Falls back to "free" for cloud workspaces without an active subscription
 * (the limited hosted tier). OSS edition never reaches this code path because
 * `lib/license.ts` short-circuits before importing this module.
 */
export async function tierForWorkspace(workspaceId: string): Promise<LicenseTier> {
  const [sub] = await db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.workspaceId, workspaceId))
    .limit(1);

  if (!sub) return "free";
  if (!ACTIVE_STATUSES.has(sub.status)) return "free";
  return sub.tier as LicenseTier;
}
