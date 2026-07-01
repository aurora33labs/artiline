import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { getClientIp, isRateLimited, recordFailure } from "@/lib/rate-limit";
import {
  CLIENT_SECRET_PREFIX,
  displayPrefix,
  isAllowedRedirectUri,
  newSecret,
  sha256,
} from "@/lib/oauth";
import { corsHeaders, corsPreflight } from "@/lib/cors";

export const runtime = "nodejs";

export function OPTIONS() {
  return corsPreflight();
}

/**
 * Dynamic Client Registration (RFC 7591). Claude's web connector self-registers
 * here before the authorization flow. Public per spec (no auth), but bounded:
 * IP rate limit, redirect_uri scheme/count validation. Claude registers a public
 * client (`token_endpoint_auth_method: "none"`) and proves itself with PKCE.
 */
const registerSchema = z.object({
  client_name: z.string().max(200).optional(),
  redirect_uris: z.array(z.string().max(2000)).min(1).max(5),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  token_endpoint_auth_method: z.enum(["none", "client_secret_post"]).optional(),
  scope: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  const ip = await getClientIp();
  const buckets = ip
    ? [{ key: ip, kind: "oauth-register-ip", limit: 10, windowMin: 60 }]
    : [];
  if (buckets.length && (await isRateLimited(buckets)).limited) {
    return NextResponse.json(
      { error: "temporarily_unavailable" },
      { status: 429, headers: corsHeaders() },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_client_metadata" },
      { status: 400, headers: corsHeaders() },
    );
  }
  const data = parsed.data;

  if (!data.redirect_uris.every(isAllowedRedirectUri)) {
    return NextResponse.json(
      {
        error: "invalid_redirect_uri",
        error_description: "redirect_uris must be https (or http on localhost).",
      },
      { status: 400, headers: corsHeaders() },
    );
  }

  if (buckets.length) await recordFailure(buckets); // count every registration

  const authMethod = data.token_endpoint_auth_method ?? "none";
  const confidential = authMethod === "client_secret_post";
  const rawSecret = confidential ? newSecret(CLIENT_SECRET_PREFIX) : null;

  const [client] = await db
    .insert(schema.oauthClients)
    .values({
      clientSecretHash: rawSecret ? sha256(rawSecret) : null,
      clientSecretPrefix: rawSecret ? displayPrefix(rawSecret) : null,
      redirectUris: data.redirect_uris,
      clientName: data.client_name ?? null,
      grantTypes: data.grant_types ?? ["authorization_code", "refresh_token"],
      responseTypes: data.response_types ?? ["code"],
      tokenEndpointAuthMethod: authMethod,
      scope: data.scope ?? null,
    })
    .returning();

  const issuedAt = Math.floor(client.createdAt.getTime() / 1000);
  return NextResponse.json(
    {
      client_id: client.id,
      ...(rawSecret ? { client_secret: rawSecret } : {}),
      client_id_issued_at: issuedAt,
      client_secret_expires_at: 0, // never expires
      redirect_uris: client.redirectUris,
      client_name: client.clientName ?? undefined,
      grant_types: client.grantTypes,
      response_types: client.responseTypes,
      token_endpoint_auth_method: client.tokenEndpointAuthMethod,
      ...(client.scope ? { scope: client.scope } : {}),
    },
    { status: 201, headers: { "Cache-Control": "no-store", ...corsHeaders() } },
  );
}
