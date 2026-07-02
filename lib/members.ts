import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export type AddableUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
};

/**
 * Users an admin may add to `workspaceId` directly (no invite): people who
 * already share at least one workspace with `actorUserId`, minus those already
 * in the target workspace. Scoped to the actor's own circle so it never becomes
 * an instance-wide user directory — the codebase deliberately avoids leaking
 * which accounts exist. Used both to render the picker and to validate the add
 * action server-side (never trust client-supplied ids).
 */
export async function listAddableUsers(
  actorUserId: string,
  workspaceId: string,
): Promise<AddableUser[]> {
  // Workspaces the actor belongs to.
  const myWs = await db
    .select({ id: schema.workspaceMembers.workspaceId })
    .from(schema.workspaceMembers)
    .where(eq(schema.workspaceMembers.userId, actorUserId));
  const wsIds = myWs.map((r) => r.id);
  if (wsIds.length === 0) return [];

  // Members already in the target workspace — exclude them.
  const current = await db
    .select({ userId: schema.workspaceMembers.userId })
    .from(schema.workspaceMembers)
    .where(eq(schema.workspaceMembers.workspaceId, workspaceId));
  const exclude = new Set(current.map((r) => r.userId));

  // Distinct users across the actor's workspaces.
  const rows = await db
    .selectDistinct({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      image: schema.users.image,
    })
    .from(schema.workspaceMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.workspaceMembers.userId))
    .where(inArray(schema.workspaceMembers.workspaceId, wsIds));

  return rows
    .filter((r) => !exclude.has(r.id))
    .sort((a, b) => a.email.localeCompare(b.email));
}
