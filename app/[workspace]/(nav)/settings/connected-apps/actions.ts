"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireMemberPage } from "@/lib/tenant";

/**
 * Revoke a connected OAuth app for the current member in this workspace: mark all
 * of that client's access + refresh tokens revoked. Any member may revoke their
 * own connections. Kills the connection immediately (next MCP call 401s).
 */
export async function revokeConnectedApp(formData: FormData) {
  const workspaceSlug = String(formData.get("workspaceSlug") ?? "");
  const clientId = String(formData.get("clientId") ?? "");

  const { workspace, session } = await requireMemberPage(workspaceSlug);
  const now = new Date();

  await db
    .update(schema.oauthAccessTokens)
    .set({ revokedAt: now })
    .where(
      and(
        eq(schema.oauthAccessTokens.clientId, clientId),
        eq(schema.oauthAccessTokens.workspaceId, workspace.id),
        eq(schema.oauthAccessTokens.userId, session.user.id),
      ),
    );
  await db
    .update(schema.oauthRefreshTokens)
    .set({ revokedAt: now })
    .where(
      and(
        eq(schema.oauthRefreshTokens.clientId, clientId),
        eq(schema.oauthRefreshTokens.workspaceId, workspace.id),
        eq(schema.oauthRefreshTokens.userId, session.user.id),
      ),
    );

  revalidatePath(`/${workspaceSlug}/settings/connected-apps`);
}
