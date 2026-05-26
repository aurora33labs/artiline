import "server-only";
import { and, eq, lt } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { isFeatureEnabled } from "@/lib/license";

const DEFAULT_OSS_DAYS = 30;
const EXTENDED_DAYS = 365;

/**
 * Prune audit/event rows older than retention horizon.
 *
 * - OSS / studio / agency tier: 30 days
 * - agency_plus with audit_retention_extended: 365 days
 *
 * Per-workspace evaluation so customers with paid retention keep their data
 * while older free-tier customers get pruned.
 */
export async function pruneAuditEvents(): Promise<{ pruned: number }> {
  const workspaces = await db.select().from(schema.workspaces);

  let pruned = 0;
  for (const ws of workspaces) {
    const extended = await isFeatureEnabled("audit_retention_extended", {
      workspaceId: ws.id,
    });
    const days = extended ? EXTENDED_DAYS : DEFAULT_OSS_DAYS;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await db
      .delete(schema.events)
      .where(
        and(
          eq(schema.events.workspaceId, ws.id),
          lt(schema.events.createdAt, cutoff),
        ),
      );
    pruned += result.rowCount ?? 0;
  }

  return { pruned };
}
