import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export type WebhookEvent =
  | "artifact.created"
  | "version.published"
  | "version.proposed"
  | "version.approved"
  | "version.changes_requested"
  | "version.rolled_back"
  | "comment.created"
  | "artifact.viewed"
  | "artifact.deleted";

export const ALL_EVENTS: WebhookEvent[] = [
  "artifact.created",
  "version.published",
  "version.proposed",
  "version.approved",
  "version.changes_requested",
  "version.rolled_back",
  "comment.created",
  "artifact.viewed",
  "artifact.deleted",
];

/**
 * Enqueue webhook deliveries for every enabled webhook in the workspace that
 * subscribes to this event. Deliveries land in `webhook_deliveries` with
 * status='pending' and are picked up by the cron route.
 */
export async function emitEvent(
  workspaceId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  const targets = await db
    .select()
    .from(schema.webhooks)
    .where(
      and(
        eq(schema.webhooks.workspaceId, workspaceId),
        eq(schema.webhooks.enabled, true),
      ),
    );

  if (targets.length === 0) return;

  const enriched = { event, ts: new Date().toISOString(), ...payload };

  await db.insert(schema.webhookDeliveries).values(
    targets
      .filter((w) => w.events.includes(event))
      .map((w) => ({
        webhookId: w.id,
        event,
        payload: enriched,
        status: "pending" as const,
        nextAttemptAt: new Date(),
      })),
  );
}

/**
 * Rate-limit `artifact.viewed` events: emit at most one per (workspace, artifact, viewerHash) per hour.
 * Returns true if we should emit.
 */
export async function shouldEmitView(
  workspaceId: string,
  artifactId: string,
  viewerHash: string,
): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.viewEvents)
    .where(
      and(
        eq(schema.viewEvents.artifactId, artifactId),
        eq(schema.viewEvents.viewerHash, viewerHash),
        sql`${schema.viewEvents.createdAt} > now() - interval '1 hour'`,
      ),
    );
  void workspaceId;
  return (row?.n ?? 0) <= 1; // 1 because the row we just inserted is included
}
