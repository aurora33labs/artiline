import { NextResponse } from "next/server";
import {
  generateProtectedResourceMetadata,
  getPublicOrigin,
} from "mcp-handler";

export const runtime = "nodejs";

/**
 * Protected-resource metadata (RFC 9728). The MCP server's 401 `WWW-Authenticate`
 * points Claude here, and this advertises which authorization server guards the
 * `/api/mcp` resource. `resource` MUST equal the MCP URL the connector is
 * configured against.
 *
 * `bearer_methods_supported: ["header"]` is required for the Claude.ai connector
 * to attach the token in the `Authorization` header — without it Claude completes
 * OAuth but never sends the Bearer token. `scopes_supported` is likewise expected.
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Max-Age": "86400",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export function GET(req: Request) {
  const origin = getPublicOrigin(req);
  const metadata = generateProtectedResourceMetadata({
    authServerUrls: [origin],
    resourceUrl: `${origin}/api/mcp`,
    additionalMetadata: {
      scopes_supported: ["artifacts:write"],
      bearer_methods_supported: ["header"],
    },
  });
  return NextResponse.json(metadata, { headers: CORS });
}
