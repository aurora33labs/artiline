"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { db, schema } from "@/lib/db";
import { requireSession } from "@/lib/tenant";
import {
  validateAuthorize,
  errorRedirectUrl,
  type AuthorizeInput,
} from "@/lib/oauth-authorize";
import { AUTH_CODE_PREFIX, AUTH_CODE_TTL_MS, newSecret, sha256 } from "@/lib/oauth";

/**
 * Consent decision handler. Re-validates the OAuth request (defense in depth),
 * verifies the user is a member of the chosen workspace, and — on approval —
 * mints a single-use authorization code bound to {client, user, workspace, role,
 * PKCE challenge, redirect_uri, scope}. Any member may grant; the token role is
 * the member's live role (create_artifact only needs member).
 */
async function originFromHeaders(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export async function authorizeDecision(formData: FormData) {
  const session = await requireSession();
  const userId = session.user.id;

  const input: AuthorizeInput = {
    client_id: formData.get("client_id") as string | null,
    redirect_uri: formData.get("redirect_uri") as string | null,
    response_type: "code",
    code_challenge: formData.get("code_challenge") as string | null,
    code_challenge_method: formData.get("code_challenge_method") as string | null,
    state: formData.get("state") as string | null,
    scope: formData.get("scope") as string | null,
    resource: formData.get("resource") as string | null,
  };
  const decision = String(formData.get("decision") ?? "");
  const workspaceId = String(formData.get("workspaceId") ?? "");

  const origin = await originFromHeaders();
  const v = await validateAuthorize(input, origin);
  if (v.kind !== "ok") {
    // Bad client / redirect_uri (hard_error) or a redirectable error: for the
    // consent action we surface a generic failure page rather than trusting an
    // unvalidated URI. redirect_error still has a validated URI, so honor it.
    if (v.kind === "redirect_error") {
      redirect(errorRedirectUrl(v.redirectUri, v.error, v.state));
    }
    throw new Error("OAUTH_INVALID_REQUEST");
  }

  if (decision !== "allow") {
    redirect(errorRedirectUrl(v.value.redirectUri, "access_denied", v.value.state));
  }

  // The chosen workspace must be one the user actually belongs to; take the live role.
  const [membership] = await db
    .select({ role: schema.workspaceMembers.role })
    .from(schema.workspaceMembers)
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, workspaceId),
        eq(schema.workspaceMembers.userId, userId),
      ),
    )
    .limit(1);
  if (!membership) {
    redirect(errorRedirectUrl(v.value.redirectUri, "access_denied", v.value.state));
  }

  const rawCode = newSecret(AUTH_CODE_PREFIX);
  await db.insert(schema.oauthAuthorizationCodes).values({
    codeHash: sha256(rawCode),
    clientId: v.value.client.id,
    userId,
    workspaceId,
    role: membership.role,
    redirectUri: v.value.redirectUri,
    codeChallenge: v.value.codeChallenge,
    codeChallengeMethod: "S256",
    scopes: v.value.scopes,
    resource: v.value.resource,
    expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
  });

  const back = new URL(v.value.redirectUri);
  back.searchParams.set("code", rawCode);
  if (v.value.state) back.searchParams.set("state", v.value.state);
  redirect(back.toString());
}
