import "server-only";
import { count, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { currentEdition, resolveLicense } from "@/lib/license";
import { TIER_LIMITS, type PlanLimits } from "@/lib/features";

const UNLIMITED: PlanLimits = { members: -1, artifacts: -1 };

/**
 * Quotas for a workspace.
 *
 * Self-host (oss edition) is never quota-limited — operators run their own
 * infrastructure. In cloud, the limit comes from the workspace's tier (free
 * when there is no active subscription).
 */
export async function planLimitsForWorkspace(
  workspaceId: string,
): Promise<PlanLimits> {
  if (currentEdition() === "oss") return UNLIMITED;
  const { tier } = await resolveLicense(workspaceId);
  return TIER_LIMITS[tier];
}

export type WorkspaceUsage = { members: number; artifacts: number };

export async function getWorkspaceUsage(
  workspaceId: string,
): Promise<WorkspaceUsage> {
  const [m] = await db
    .select({ n: count() })
    .from(schema.workspaceMembers)
    .where(eq(schema.workspaceMembers.workspaceId, workspaceId));
  const [a] = await db
    .select({ n: count() })
    .from(schema.artifacts)
    .where(eq(schema.artifacts.workspaceId, workspaceId));
  return { members: m?.n ?? 0, artifacts: a?.n ?? 0 };
}

/** Throws `LIMIT_ARTIFACTS` when the workspace is at its artifact quota. */
export async function assertCanCreateArtifact(workspaceId: string): Promise<void> {
  const limits = await planLimitsForWorkspace(workspaceId);
  if (limits.artifacts < 0) return;
  const [a] = await db
    .select({ n: count() })
    .from(schema.artifacts)
    .where(eq(schema.artifacts.workspaceId, workspaceId));
  if ((a?.n ?? 0) >= limits.artifacts) throw new Error("LIMIT_ARTIFACTS");
}

/**
 * Throws `LIMIT_MEMBERS` when adding one more would exceed the seat quota.
 * Counts current members plus pending invitations so a burst of invites can't
 * overshoot the cap.
 */
export async function assertCanAddMember(workspaceId: string): Promise<void> {
  const limits = await planLimitsForWorkspace(workspaceId);
  if (limits.members < 0) return;
  const [m] = await db
    .select({ n: count() })
    .from(schema.workspaceMembers)
    .where(eq(schema.workspaceMembers.workspaceId, workspaceId));
  const [i] = await db
    .select({ n: count() })
    .from(schema.invitations)
    .where(eq(schema.invitations.workspaceId, workspaceId));
  if ((m?.n ?? 0) + (i?.n ?? 0) >= limits.members) {
    throw new Error("LIMIT_MEMBERS");
  }
}

/**
 * Max workspaces a self-hosted (oss) instance may hold. This is an
 * instance-wide cap (not per-workspace), so an OSS deployment can't be run as a
 * multi-tenant SaaS. The cloud edition manages tenancy itself and is unaffected.
 */
export const OSS_WORKSPACE_LIMIT = 3;

/** Throws `LIMIT_WORKSPACES` when an oss instance is already at the cap. */
export async function assertCanCreateWorkspace(): Promise<void> {
  if (currentEdition() !== "oss") return;
  const [w] = await db.select({ n: count() }).from(schema.workspaces);
  if ((w?.n ?? 0) >= OSS_WORKSPACE_LIMIT) throw new Error("LIMIT_WORKSPACES");
}
