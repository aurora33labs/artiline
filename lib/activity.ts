import "server-only";
import { db, schema } from "@/lib/db";

export type EventType =
  | "artifact.created"
  | "artifact.deleted"
  | "version.published"
  | "version.proposed"
  | "version.approved"
  | "version.changes_requested"
  | "version.rolled_back"
  | "visibility.changed"
  | "member.invited"
  | "member.joined"
  | "member.removed"
  | "invitation.revoked"
  | "comment.created"
  | "external.site_created"
  | "external.page_changed";

export async function recordEvent({
  workspaceId,
  actorUserId,
  type,
  subjectType,
  subjectId,
  payload,
}: {
  workspaceId: string;
  actorUserId: string | null;
  type: EventType;
  subjectType: string;
  subjectId: string | null;
  payload: Record<string, unknown>;
}): Promise<void> {
  await db.insert(schema.events).values({
    workspaceId,
    actorUserId,
    type,
    subjectType,
    subjectId,
    payload,
  });
}
