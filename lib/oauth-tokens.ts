import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { type WorkspaceRole } from "@/lib/tenant";
import {
  ACCESS_TOKEN_PREFIX,
  ACCESS_TOKEN_TTL_MS,
  ACCESS_TOKEN_TTL_S,
  REFRESH_TOKEN_PREFIX,
  REFRESH_TOKEN_TTL_MS,
  displayPrefix,
  newSecret,
  sha256,
} from "@/lib/oauth";

/** Live workspace membership role for (workspace,user), or null if not a member. */
export async function liveMemberRole(
  workspaceId: string,
  userId: string,
): Promise<WorkspaceRole | null> {
  const [m] = await db
    .select({ role: schema.workspaceMembers.role })
    .from(schema.workspaceMembers)
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, workspaceId),
        eq(schema.workspaceMembers.userId, userId),
      ),
    )
    .limit(1);
  return m?.role ?? null;
}

export type IssueGrant = {
  clientId: string;
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
  scopes: string[];
};

export type IssuedTokens = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
};

/**
 * Issue an access + refresh token pair for a grant. The access token is stored
 * first so the refresh row can link it (for cascade revoke on rotation). Only
 * hashes are persisted; the raw tokens are returned once to the caller.
 */
export async function issueTokenPair(grant: IssueGrant): Promise<IssuedTokens> {
  const rawAccess = newSecret(ACCESS_TOKEN_PREFIX);
  const rawRefresh = newSecret(REFRESH_TOKEN_PREFIX);
  const now = Date.now();

  const [access] = await db
    .insert(schema.oauthAccessTokens)
    .values({
      tokenHash: sha256(rawAccess),
      tokenPrefix: displayPrefix(rawAccess),
      clientId: grant.clientId,
      userId: grant.userId,
      workspaceId: grant.workspaceId,
      role: grant.role,
      scopes: grant.scopes,
      expiresAt: new Date(now + ACCESS_TOKEN_TTL_MS),
    })
    .returning();

  await db.insert(schema.oauthRefreshTokens).values({
    tokenHash: sha256(rawRefresh),
    tokenPrefix: displayPrefix(rawRefresh),
    clientId: grant.clientId,
    userId: grant.userId,
    workspaceId: grant.workspaceId,
    role: grant.role,
    scopes: grant.scopes,
    accessTokenId: access.id,
    expiresAt: new Date(now + REFRESH_TOKEN_TTL_MS),
  });

  return {
    access_token: rawAccess,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_S,
    refresh_token: rawRefresh,
    scope: grant.scopes.join(" "),
  };
}

/** Revoke every access + refresh token for a (client,user,workspace) family. */
export async function revokeTokenFamily(
  clientId: string,
  userId: string,
  workspaceId: string,
): Promise<void> {
  const now = new Date();
  await db
    .update(schema.oauthAccessTokens)
    .set({ revokedAt: now })
    .where(
      and(
        eq(schema.oauthAccessTokens.clientId, clientId),
        eq(schema.oauthAccessTokens.userId, userId),
        eq(schema.oauthAccessTokens.workspaceId, workspaceId),
      ),
    );
  await db
    .update(schema.oauthRefreshTokens)
    .set({ revokedAt: now })
    .where(
      and(
        eq(schema.oauthRefreshTokens.clientId, clientId),
        eq(schema.oauthRefreshTokens.userId, userId),
        eq(schema.oauthRefreshTokens.workspaceId, workspaceId),
      ),
    );
}
