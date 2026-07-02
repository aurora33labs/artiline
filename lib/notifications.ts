import "server-only";
import { and, count, desc, eq, isNull, ne } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export type NotificationType =
  | "version.proposed"
  | "version.approved"
  | "version.changes_requested";

export type NotificationPayload = {
  actorName?: string;
  artifactSlug?: string;
  artifactTitle?: string;
  versionNumber?: number;
};

type NotifyRow = {
  workspaceId: string;
  recipientUserId: string;
  actorUserId: string | null;
  type: NotificationType;
  artifactId?: string | null;
  payload: NotificationPayload;
};

/**
 * Insert notification rows, skipping any where the recipient is the actor (never
 * notify yourself). No-op on an empty list.
 */
export async function notify(rows: NotifyRow[]): Promise<void> {
  const real = rows.filter((r) => r.recipientUserId !== r.actorUserId);
  if (real.length === 0) return;
  await db.insert(schema.notifications).values(
    real.map((r) => ({
      workspaceId: r.workspaceId,
      recipientUserId: r.recipientUserId,
      actorUserId: r.actorUserId,
      type: r.type,
      artifactId: r.artifactId ?? null,
      payload: r.payload,
    })),
  );
}

/** Owner/admin user ids of a workspace (the people who can review proposals). */
async function workspaceManagers(workspaceId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: schema.workspaceMembers.userId })
    .from(schema.workspaceMembers)
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, workspaceId),
        ne(schema.workspaceMembers.role, "member"),
      ),
    );
  return rows.map((r) => r.userId);
}

/**
 * A member proposed a new version → notify the artifact author plus every
 * owner/admin (deduped; the actor is filtered out inside `notify`).
 */
export async function notifyProposal(args: {
  workspaceId: string;
  actorUserId: string;
  authorUserId: string;
  artifactId: string;
  payload: NotificationPayload;
}): Promise<void> {
  const managers = await workspaceManagers(args.workspaceId);
  const recipients = new Set<string>([args.authorUserId, ...managers]);
  await notify(
    [...recipients].map((recipientUserId) => ({
      workspaceId: args.workspaceId,
      recipientUserId,
      actorUserId: args.actorUserId,
      type: "version.proposed" as const,
      artifactId: args.artifactId,
      payload: args.payload,
    })),
  );
}

/**
 * A reviewer approved / requested changes on a proposed version → notify the
 * version's author (the proposer).
 */
export async function notifyDecision(args: {
  workspaceId: string;
  actorUserId: string;
  proposerUserId: string;
  artifactId: string;
  type: "version.approved" | "version.changes_requested";
  payload: NotificationPayload;
}): Promise<void> {
  await notify([
    {
      workspaceId: args.workspaceId,
      recipientUserId: args.proposerUserId,
      actorUserId: args.actorUserId,
      type: args.type,
      artifactId: args.artifactId,
      payload: args.payload,
    },
  ]);
}

export async function getUnreadCount(
  userId: string,
  workspaceId: string,
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.recipientUserId, userId),
        eq(schema.notifications.workspaceId, workspaceId),
        isNull(schema.notifications.readAt),
      ),
    );
  return row?.n ?? 0;
}

export type NotificationItem = {
  id: string;
  type: string;
  actorName: string | null;
  artifactSlug: string | null;
  artifactTitle: string | null;
  versionNumber: number | null;
  readAt: Date | null;
  createdAt: Date;
};

export async function listNotifications(
  userId: string,
  workspaceId: string,
  limit = 20,
): Promise<NotificationItem[]> {
  const rows = await db
    .select()
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.recipientUserId, userId),
        eq(schema.notifications.workspaceId, workspaceId),
      ),
    )
    .orderBy(desc(schema.notifications.createdAt))
    .limit(limit);

  return rows.map((r) => {
    const p = (r.payload ?? {}) as NotificationPayload;
    return {
      id: r.id,
      type: r.type,
      actorName: p.actorName ?? null,
      artifactSlug: p.artifactSlug ?? null,
      artifactTitle: p.artifactTitle ?? null,
      versionNumber: p.versionNumber ?? null,
      readAt: r.readAt,
      createdAt: r.createdAt,
    };
  });
}
