/**
 * CORS for the browser-based MCP client (Claude.ai web connector). The MCP and
 * OAuth token/register endpoints are fetched cross-origin from `https://claude.ai`,
 * so they must allow the origin AND expose `WWW-Authenticate` (the OAuth challenge
 * the client reads to start the flow) and `Mcp-Session-Id`. Bearer auth means no
 * cookies, so a wildcard origin is safe. Metadata routes already send their own CORS.
 */
export function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Accept, Last-Event-ID",
    "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
    "Access-Control-Max-Age": "86400",
  };
}

/** Clone a Response with CORS headers merged in (streaming body preserved). */
export function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders())) headers.set(k, v);
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

/** Preflight (OPTIONS) response. */
export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
