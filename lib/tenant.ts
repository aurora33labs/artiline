import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { redirect, notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { auth } from "@/auth";

export type WorkspaceRole = "owner" | "admin" | "member";

type Workspace = typeof schema.workspaces.$inferSelect;

/**
 * The minimal authenticated context the artifact routes and services need. Both
 * `requireMember` (session cookie) and `requireApiKey` (Bearer token) resolve to
 * this shape, so downstream code is agnostic to how the caller authenticated.
 * The full Auth.js `Session` is assignable to `session` (it only reads `user.id`).
 */
export type AuthContext = {
  session: { user: { id: string } };
  workspace: Workspace;
  role: WorkspaceRole;
};

const ROLE_RANK: Record<WorkspaceRole, number> = {
  member: 0,
  admin: 1,
  owner: 2,
};

/** The less-privileged of two roles — used to cap a token by its ceiling. */
export function minRole(a: WorkspaceRole, b: WorkspaceRole): WorkspaceRole {
  return ROLE_RANK[a] <= ROLE_RANK[b] ? a : b;
}

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

/** Extract the raw token from an `Authorization: Bearer artl_...` header. */
export function bearerToken(authHeader: string | null | undefined): string | null {
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  const token = m?.[1]?.trim();
  return token && token.startsWith("artl_") ? token : null;
}

/**
 * Resolve a workspace API token to an `AuthContext`. The token grants access to
 * exactly one workspace; passing a `workspaceSlug` that doesn't match the key's
 * workspace 404s (no existence leak). The effective role is the lesser of the
 * key's ceiling and the attributed member's live role, so revoking/downgrading
 * the member tightens the key automatically.
 *
 * Throws `INVALID_TOKEN` (→401) for unknown/revoked/expired tokens and
 * `NOT_A_MEMBER` (→404) when the token doesn't belong to the requested
 * workspace or the member no longer belongs to it.
 */
export async function requireApiKey(
  workspaceSlug: string,
  rawToken: string,
): Promise<AuthContext> {
  const ctx = await resolveApiKey(rawToken);
  // Scope check after validity so a valid token aimed at the wrong workspace
  // 404s rather than leaking that the token itself is good.
  if (ctx.workspace.slug !== workspaceSlug) throw new Error("NOT_A_MEMBER");
  return ctx;
}

/**
 * Resolve a raw API token to its `AuthContext` with no workspace-slug check —
 * the workspace is taken from the token itself. Used by the MCP server, where
 * the workspace is implicit in the credential. Throws `INVALID_TOKEN` for
 * unknown/revoked/expired tokens.
 */
export async function resolveApiKey(rawToken: string): Promise<AuthContext> {
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const [row] = await db
    .select({
      key: schema.apiKeys,
      workspace: schema.workspaces,
      memberRole: schema.workspaceMembers.role,
    })
    .from(schema.apiKeys)
    .innerJoin(
      schema.workspaces,
      eq(schema.workspaces.id, schema.apiKeys.workspaceId),
    )
    .innerJoin(
      schema.workspaceMembers,
      and(
        eq(schema.workspaceMembers.workspaceId, schema.apiKeys.workspaceId),
        eq(schema.workspaceMembers.userId, schema.apiKeys.userId),
      ),
    )
    .where(eq(schema.apiKeys.tokenHash, tokenHash))
    .limit(1);

  if (!row) throw new Error("INVALID_TOKEN");
  if (row.key.revokedAt) throw new Error("INVALID_TOKEN");
  if (row.key.expiresAt && row.key.expiresAt.getTime() <= Date.now()) {
    throw new Error("INVALID_TOKEN");
  }

  // Best-effort last-used stamp; never block the request on it.
  void db
    .update(schema.apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.apiKeys.id, row.key.id))
    .catch(() => {});

  return {
    session: { user: { id: row.key.userId } },
    workspace: row.workspace,
    role: minRole(row.key.role, row.memberRole),
  };
}

/**
 * Accept either a session cookie or a Bearer API token. Pass the request's raw
 * `Authorization` header; if it carries an `artl_` token the token path is used,
 * otherwise it falls back to the session path. Both return the same
 * `AuthContext`, so callers are auth-method agnostic.
 */
export async function requireMemberOrToken(
  workspaceSlug: string,
  authHeader: string | null | undefined,
): Promise<AuthContext> {
  const token = bearerToken(authHeader);
  if (token) return requireApiKey(workspaceSlug, token);
  return requireMember(workspaceSlug);
}

/**
 * Resolve an OAuth access token (`art_at_...`) to an `AuthContext`, plus the
 * `clientId`/`scopes`/`expiresAt` the MCP layer needs to populate `AuthInfo`.
 * Mirrors `resolveApiKey`: reject revoked/expired, cap the role to the member's
 * live role, and best-effort stamp `lastUsedAt`. Throws `INVALID_TOKEN`.
 */
export async function resolveAccessToken(rawToken: string): Promise<
  AuthContext & { clientId: string; scopes: string[]; expiresAt: Date }
> {
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const [row] = await db
    .select({
      token: schema.oauthAccessTokens,
      workspace: schema.workspaces,
      memberRole: schema.workspaceMembers.role,
    })
    .from(schema.oauthAccessTokens)
    .innerJoin(
      schema.workspaces,
      eq(schema.workspaces.id, schema.oauthAccessTokens.workspaceId),
    )
    .innerJoin(
      schema.workspaceMembers,
      and(
        eq(schema.workspaceMembers.workspaceId, schema.oauthAccessTokens.workspaceId),
        eq(schema.workspaceMembers.userId, schema.oauthAccessTokens.userId),
      ),
    )
    .where(eq(schema.oauthAccessTokens.tokenHash, tokenHash))
    .limit(1);

  if (!row) throw new Error("INVALID_TOKEN");
  if (row.token.revokedAt) throw new Error("INVALID_TOKEN");
  if (row.token.expiresAt.getTime() <= Date.now()) {
    throw new Error("INVALID_TOKEN");
  }

  void db
    .update(schema.oauthAccessTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.oauthAccessTokens.id, row.token.id))
    .catch(() => {});

  return {
    session: { user: { id: row.token.userId } },
    workspace: row.workspace,
    role: minRole(row.token.role, row.memberRole),
    clientId: row.token.clientId,
    scopes: row.token.scopes,
    expiresAt: row.token.expiresAt,
  };
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
  if (msg === "INVALID_TOKEN")
    return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 401 });
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
