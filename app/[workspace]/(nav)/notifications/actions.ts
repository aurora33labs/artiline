"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireMemberPage } from "@/lib/tenant";
import {
  getUnreadCount,
  listNotifications,
  type NotificationItem,
} from "@/lib/notifications";

/** Poll target for the bell: unread count + recent items for the current user. */
export async function fetchNotifications(
  workspaceSlug: string,
): Promise<{ unread: number; items: NotificationItem[] }> {
  const { session, workspace } = await requireMemberPage(workspaceSlug);
  const [unread, items] = await Promise.all([
    getUnreadCount(session.user.id, workspace.id),
    listNotifications(session.user.id, workspace.id, 15),
  ]);
  return { unread, items };
}

/** Mark all of the current user's unread notifications in this workspace read. */
export async function markAllRead(workspaceSlug: string): Promise<void> {
  const { session, workspace } = await requireMemberPage(workspaceSlug);
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(schema.notifications.recipientUserId, session.user.id),
        eq(schema.notifications.workspaceId, workspace.id),
        isNull(schema.notifications.readAt),
      ),
    );
  revalidatePath(`/${workspaceSlug}/notifications`);
}
