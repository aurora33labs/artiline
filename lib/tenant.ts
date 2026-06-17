import { and, eq } from "drizzle-orm";
import { redirect, notFound } from "next/navigation";
import { NextResponse } from "next/server";
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

/**
 * Single source of truth for who may manage a given member. Pure (no DB) so the
 * settings page (render) and the server actions (enforcement) agree exactly.
 *
 * Rules (product decisions):
 * - Never act on yourself (actor === target) or on the owner — both immutable.
 * - Owner manages any non-owner: remove + assign member/admin.
 * - Admin manages only members: remove + promote member→admin. An admin can NOT
 *   touch another admin (not remove, not change role) — this is what stops the
 *   "demote an admin to member, then delete" bypass of the no-admin-deletes-admin
 *   rule, so degrading an admin stays owner-only.
 * - Ownership is never transferable here: `assignableRoles` never includes "owner".
 */
export function memberManagementRights(args: {
  actorUserId: string;
  actorRole: WorkspaceRole;
  ownerUserId: string;
  targetUserId: string;
  targetRole: WorkspaceRole;
}): { canRemove: boolean; assignableRoles: WorkspaceRole[] } {
  const none = { canRemove: false, assignableRoles: [] as WorkspaceRole[] };
  const { actorUserId, actorRole, ownerUserId, targetUserId, targetRole } = args;

  if (actorUserId === targetUserId) return none; // no self-management
  if (targetUserId === ownerUserId) return none; // owner is immutable

  // Owner (by ownership, not just role) manages every non-owner member.
  if (actorUserId === ownerUserId)
    return { canRemove: true, assignableRoles: ["member", "admin"] };

  if (actorRole === "admin") {
    if (targetRole === "admin") return none; // admin can't touch another admin
    // target is a member: removable + promotable. "member" stays selectable as
    // the current (no-op) value; admins can promote but not create new powers
    // they couldn't otherwise undo on an admin.
    return { canRemove: true, assignableRoles: ["member", "admin"] };
  }

  return none; // members manage nobody
}

/**
 * Redirect-context guards. Same checks as `requireMember` / `requireRole`, but
 * an unauthorized request becomes a clean redirect / 404 instead of an uncaught
 * 500. Use in **pages, layouts, and server actions** (all support redirect /
 * notFound control flow). API route handlers should catch the thrown guard
 * errors with `guardErrorResponse` instead, since they return a `Response`.
 *
 * Denial is unchanged — the guarded code still never runs for an unauthorized
 * caller; only the surfaced result changes (redirect/404 vs thrown 500).
 *
 * - Logged out → `/login`.
 * - Logged in but not a member → `notFound()`. 404 (not a redirect) avoids
 *   confirming the workspace exists to a non-member.
 */
export async function requireMemberPage(workspaceSlug: string) {
  try {
    return await requireMember(workspaceSlug);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "UNAUTHENTICATED") redirect("/login");
    if (msg === "NOT_A_MEMBER") notFound();
    throw e;
  }
}

/** Role guard for redirect context: insufficient role → 404 (no leak). */
export function requireRolePage(
  role: WorkspaceRole,
  required: WorkspaceRole[],
): void {
  if (!required.includes(role)) notFound();
}

/**
 * Maps a thrown guard error to a clean JSON `Response` for API route handlers,
 * so an unauthorized request returns 401/403/404 instead of an uncaught 500.
 * Returns `undefined` for anything that isn't a guard error, so the caller can
 * re-throw it. Usage:
 *
 *   try { const { role } = await requireMember(slug); requireRole(role, [...]); }
 *   catch (e) { const res = guardErrorResponse(e); if (res) return res; throw e; }
 */
export function guardErrorResponse(e: unknown): NextResponse | undefined {
  const msg = (e as { message?: string } | null)?.message;
  if (msg === "UNAUTHENTICATED")
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (msg === "NOT_A_MEMBER")
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (msg === "FORBIDDEN")
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  return undefined;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}
