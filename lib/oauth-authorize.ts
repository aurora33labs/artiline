import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { DEFAULT_SCOPE, OAUTH_SCOPES } from "@/lib/oauth";

/**
 * Shared validation for the OAuth authorization request, used by both the
 * `/api/oauth/authorize` GET route (login bounce) and the consent server action
 * (defense in depth). Keeps the redirect_uri allowlist check in one place — the
 * single most security-critical gate (anti open-redirect).
 */

export type OAuthClient = typeof schema.oauthClients.$inferSelect;

export type AuthorizeInput = {
  client_id?: string | null;
  redirect_uri?: string | null;
  response_type?: string | null;
  code_challenge?: string | null;
  code_challenge_method?: string | null;
  state?: string | null;
  scope?: string | null;
  resource?: string | null;
};

export type ValidatedAuthorize = {
  client: OAuthClient;
  redirectUri: string;
  codeChallenge: string;
  state: string;
  scopes: string[];
  resource: string | null;
};

export type AuthorizeValidation =
  // Cannot safely redirect (bad client or unregistered redirect_uri): render an
  // error page instead of redirecting anywhere.
  | { kind: "hard_error"; message: string }
  // Validated up to the redirect_uri: any further error is delivered back to the
  // client via redirect_uri?error=...
  | { kind: "redirect_error"; redirectUri: string; error: string; state: string }
  | { kind: "ok"; value: ValidatedAuthorize };

export async function validateAuthorize(
  input: AuthorizeInput,
  origin: string,
): Promise<AuthorizeValidation> {
  const clientId = (input.client_id ?? "").trim();
  const redirectUri = (input.redirect_uri ?? "").trim();
  const state = input.state ?? "";

  if (!clientId) return { kind: "hard_error", message: "Missing client_id." };

  const [client] = await db
    .select()
    .from(schema.oauthClients)
    .where(eq(schema.oauthClients.id, clientId))
    .limit(1);
  if (!client) return { kind: "hard_error", message: "Unknown client." };

  // Exact-string redirect_uri match against the registered allowlist. This must
  // pass before we are ever willing to redirect to it.
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
    return { kind: "hard_error", message: "Invalid redirect_uri." };
  }

  const err = (error: string): AuthorizeValidation => ({
    kind: "redirect_error",
    redirectUri,
    error,
    state,
  });

  if (input.response_type !== "code") return err("unsupported_response_type");

  // PKCE S256 is mandatory (OAuth 2.1).
  const codeChallenge = (input.code_challenge ?? "").trim();
  if (!codeChallenge) return err("invalid_request");
  if ((input.code_challenge_method ?? "") !== "S256") return err("invalid_request");

  // RFC 8707 resource indicator, if present, must target our MCP endpoint.
  const resource = input.resource ? input.resource.trim() : null;
  if (resource && resource !== `${origin}/api/mcp`) return err("invalid_target");

  // Intersect requested scopes with what we support; default to artifacts:write.
  const requested = (input.scope ?? "").split(/\s+/).filter(Boolean);
  const scopes = requested.filter((s) =>
    (OAUTH_SCOPES as readonly string[]).includes(s),
  );
  if (requested.length && scopes.length === 0) return err("invalid_scope");
  if (scopes.length === 0) scopes.push(DEFAULT_SCOPE);

  return {
    kind: "ok",
    value: { client, redirectUri, codeChallenge, state, scopes, resource },
  };
}

/** Build a redirect back to the client carrying an OAuth error + state. */
export function errorRedirectUrl(
  redirectUri: string,
  error: string,
  state: string,
): string {
  const u = new URL(redirectUri);
  u.searchParams.set("error", error);
  if (state) u.searchParams.set("state", state);
  return u.toString();
}
