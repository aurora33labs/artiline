import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { auth } from "@/auth";

export type WorkspaceRole = "owner" | "admin" | "member";

export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  return session;
}

export async function getMyWorkspaces(userId: string) {
  return db
    .select({
      id: schema.workspaces.id,
      slug: schema.workspaces.slug,
      name: schema.workspaces.name,
      role: schema.workspaceMembers.role,
    })
    .from(schema.workspaceMembers)
    .innerJoin(
      schema.workspaces,
      eq(schema.workspaces.id, schema.workspaceMembers.workspaceId),
    )
    .where(eq(schema.workspaceMembers.userId, userId));
}

export async function requireMember(workspaceSlug: string) {
  const session = await requireSession();
  const [row] = await db
    .select({
      workspace: schema.workspaces,
      role: schema.workspaceMembers.role,
    })
    .from(schema.workspaces)
    .innerJoin(
      schema.workspaceMembers,
      and(
        eq(schema.workspaceMembers.workspaceId, schema.workspaces.id),
        eq(schema.workspaceMembers.userId, session.user.id),
      ),
    )
    .where(eq(schema.workspaces.slug, workspaceSlug))
    .limit(1);

  if (!row) throw new Error("NOT_A_MEMBER");
  return { session, workspace: row.workspace, role: row.role };
}

export function requireRole(
  role: WorkspaceRole,
  required: WorkspaceRole[],
): void {
  if (!required.includes(role)) throw new Error("FORBIDDEN");
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}
