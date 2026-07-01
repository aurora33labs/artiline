import { NextResponse } from "next/server";
import { getPublicUrl } from "mcp-handler";
import { OAuthMetadataSchema } from "@modelcontextprotocol/sdk/shared/auth.js";
import { OAUTH_SCOPES } from "@/lib/oauth";

export const runtime = "nodejs";

/**
 * OAuth 2.1 Authorization Server metadata (RFC 8414). Claude's web connector
 * fetches this cross-origin to discover our authorize/token/register endpoints.
 * The issuer/origin is derived from the request (proxy-aware) so it's correct on
 * any deployment host.
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export function GET(req: Request) {
  const origin = getPublicUrl(req).origin;
  const metadata = OAuthMetadataSchema.parse({
    issuer: origin,
    authorization_endpoint: `${origin}/api/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
    scopes_supported: [...OAUTH_SCOPES],
  });
  return NextResponse.json(metadata, { headers: CORS });
}
