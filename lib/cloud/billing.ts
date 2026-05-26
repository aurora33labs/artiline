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
 * Falls back to "studio" for cloud workspaces without a subscription row (e.g.
 * during onboarding). OSS edition never reaches this code path because
 * `lib/license.ts` short-circuits before importing this module.
 */
export async function tierForWorkspace(workspaceId: string): Promise<LicenseTier> {
  const [sub] = await db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.workspaceId, workspaceId))
    .limit(1);

  if (!sub) return "studio";
  if (!ACTIVE_STATUSES.has(sub.status)) return "studio";
  return sub.tier as LicenseTier;
}
