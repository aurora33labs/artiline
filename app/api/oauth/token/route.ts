import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { minRole } from "@/lib/tenant";
import { getClientIp, isRateLimited, recordFailure } from "@/lib/rate-limit";
import { sha256, verifyPkceS256 } from "@/lib/oauth";
import {
  issueTokenPair,
  liveMemberRole,
  revokeTokenFamily,
} from "@/lib/oauth-tokens";
import { corsHeaders, corsPreflight } from "@/lib/cors";

export const runtime = "nodejs";

const NO_STORE = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
  ...corsHeaders(),
};

export function OPTIONS() {
  return corsPreflight();
}

function oauthError(
  error: string,
  status = 400,
  description?: string,
): NextResponse {
  return NextResponse.json(
    description ? { error, error_description: description } : { error },
    { status, headers: NO_STORE },
  );
}

/** Authenticate the client from the request body (public PKCE or secret_post). */
async function authenticateClient(
  clientId: string,
  clientSecret: string | null,
): Promise<typeof schema.oauthClients.$inferSelect | null> {
  if (!clientId) return null;
  const [client] = await db
    .select()
    .from(schema.oauthClients)
    .where(eq(schema.oauthClients.id, clientId))
    .limit(1);
  if (!client) return null;
  if (client.tokenEndpointAuthMethod === "client_secret_post") {
    if (!clientSecret || !client.clientSecretHash) return null;
    if (sha256(clientSecret) !== client.clientSecretHash) return null;
  }
  return client;
}

export async function POST(req: Request) {
  const ip = await getClientIp();
  const buckets = ip
    ? [{ key: ip, kind: "oauth-token-ip", limit: 60, windowMin: 15 }]
    : [];
  if (buckets.length && (await isRateLimited(buckets)).limited) {
    return oauthError("temporarily_unavailable", 429);
  }

  const form = await req.formData().catch(() => null);
  if (!form) return oauthError("invalid_request", 400, "Expected form body.");
  const get = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : null;
  };

  const grantType = get("grant_type");
  const clientId = get("client_id") ?? "";
  const clientSecret = get("client_secret");

  const client = await authenticateClient(clientId, clientSecret);
  if (!client) {
    if (buckets.length) await recordFailure(buckets);
    return oauthError("invalid_client", 401);
  }

  if (grantType === "authorization_code") {
    return handleAuthorizationCode(form, get, client, buckets);
  }
  if (grantType === "refresh_token") {
    return handleRefreshToken(get, client);
  }
  return oauthError("unsupported_grant_type");
}

async function handleAuthorizationCode(
  _form: FormData,
  get: (k: string) => string | null,
  client: typeof schema.oauthClients.$inferSelect,
  buckets: { key: string; kind: string; limit: number; windowMin: number }[],
): Promise<NextResponse> {
  const code = get("code");
  const redirectUri = get("redirect_uri");
  const codeVerifier = get("code_verifier");
  if (!code || !redirectUri || !codeVerifier) {
    return oauthError("invalid_request", 400, "Missing code/redirect_uri/verifier.");
  }

  const [row] = await db
    .select()
    .from(schema.oauthAuthorizationCodes)
    .where(eq(schema.oauthAuthorizationCodes.codeHash, sha256(code)))
    .limit(1);
  if (!row) {
    if (buckets.length) await recordFailure(buckets);
    return oauthError("invalid_grant", 400);
  }

  // Replay: a consumed code means the code (or a token) may be compromised.
  if (row.consumedAt) {
    await revokeTokenFamily(row.clientId, row.userId, row.workspaceId);
    return oauthError("invalid_grant", 400, "Code already used.");
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    return oauthError("invalid_grant", 400, "Code expired.");
  }
  if (row.clientId !== client.id || row.redirectUri !== redirectUri) {
    return oauthError("invalid_grant", 400);
  }
  if (!verifyPkceS256(codeVerifier, row.codeChallenge)) {
    return oauthError("invalid_grant", 400, "PKCE verification failed.");
  }

  // Live membership re-check; cap the ceiling to the member's current role.
  const live = await liveMemberRole(row.workspaceId, row.userId);
  if (!live) return oauthError("invalid_grant", 400, "No longer a member.");
  const role = minRole(row.role, live);

  // Single-use: consume before issuing.
  await db
    .update(schema.oauthAuthorizationCodes)
    .set({ consumedAt: new Date() })
    .where(eq(schema.oauthAuthorizationCodes.id, row.id));

  const tokens = await issueTokenPair({
    clientId: client.id,
    userId: row.userId,
    workspaceId: row.workspaceId,
    role,
    scopes: row.scopes,
  });
  return NextResponse.json(tokens, { headers: NO_STORE });
}

async function handleRefreshToken(
  get: (k: string) => string | null,
  client: typeof schema.oauthClients.$inferSelect,
): Promise<NextResponse> {
  const refreshToken = get("refresh_token");
  if (!refreshToken) return oauthError("invalid_request", 400);

  const [row] = await db
    .select()
    .from(schema.oauthRefreshTokens)
    .where(eq(schema.oauthRefreshTokens.tokenHash, sha256(refreshToken)))
    .limit(1);
  if (!row || row.clientId !== client.id) return oauthError("invalid_grant", 400);

  // Reuse detection: an already-rotated/revoked refresh token => compromise.
  if (row.revokedAt) {
    await revokeTokenFamily(row.clientId, row.userId, row.workspaceId);
    return oauthError("invalid_grant", 400, "Refresh token reuse detected.");
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    return oauthError("invalid_grant", 400, "Refresh token expired.");
  }

  const live = await liveMemberRole(row.workspaceId, row.userId);
  if (!live) return oauthError("invalid_grant", 400, "No longer a member.");
  const role = minRole(row.role, live);

  // Rotate: revoke the old refresh + its access token, issue a fresh pair.
  const now = new Date();
  await db
    .update(schema.oauthRefreshTokens)
    .set({ revokedAt: now })
    .where(eq(schema.oauthRefreshTokens.id, row.id));
  if (row.accessTokenId) {
    await db
      .update(schema.oauthAccessTokens)
      .set({ revokedAt: now })
      .where(eq(schema.oauthAccessTokens.id, row.accessTokenId));
  }

  const tokens = await issueTokenPair({
    clientId: client.id,
    userId: row.userId,
    workspaceId: row.workspaceId,
    role,
    scopes: row.scopes,
  });
  return NextResponse.json(tokens, { headers: NO_STORE });
}
