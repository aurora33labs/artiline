import {
  protectedResourceHandler,
  metadataCorsOptionsRequestHandler,
  getPublicOrigin,
} from "mcp-handler";

export const runtime = "nodejs";

/**
 * Protected-resource metadata (RFC 9728). The MCP server's 401 `WWW-Authenticate`
 * points Claude here (via mcp-handler's default resourceMetadataPath), and this
 * advertises which authorization server guards the `/api/mcp` resource. The
 * `resource` value MUST equal the MCP URL the connector is configured against.
 */
export function GET(req: Request) {
  const origin = getPublicOrigin(req);
  return protectedResourceHandler({
    authServerUrls: [origin],
    resourceUrl: `${origin}/api/mcp`,
  })(req);
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
