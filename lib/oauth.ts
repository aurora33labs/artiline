import "server-only";
import { createHash, randomBytes } from "node:crypto";

/**
 * Shared OAuth 2.1 constants + crypto helpers for the Artiline authorization
 * server. Tokens are opaque random strings with a typed prefix; only their
 * sha256 hash is stored, and the MCP resolver branches on the prefix.
 */

export const OAUTH_SCOPES = ["artifacts:write"] as const;
export type OAuthScope = (typeof OAUTH_SCOPES)[number];
export const DEFAULT_SCOPE: OAuthScope = "artifacts:write";

/** Token lifetimes. */
export const AUTH_CODE_TTL_MS = 60 * 1000; // 60s
export const ACCESS_TOKEN_TTL_S = 60 * 60; // 1h (seconds, for expires_in)
export const ACCESS_TOKEN_TTL_MS = ACCESS_TOKEN_TTL_S * 1000;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30d

/** Opaque token prefixes (also how the MCP resolver tells token kinds apart). */
export const ACCESS_TOKEN_PREFIX = "art_at_";
export const REFRESH_TOKEN_PREFIX = "art_rt_";
export const AUTH_CODE_PREFIX = "art_ac_";
export const CLIENT_SECRET_PREFIX = "art_cs_";

export function sha256(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** A fresh opaque secret with the given prefix (32 random bytes hex). */
export function newSecret(prefix: string): string {
  return `${prefix}${randomBytes(32).toString("hex")}`;
}

/** Store only a short prefix of the raw secret for display in listings. */
export function displayPrefix(raw: string): string {
  return raw.slice(0, 16);
}

/** PKCE S256: base64url(sha256(verifier)) must equal the stored challenge. */
export function verifyPkceS256(codeVerifier: string, codeChallenge: string): boolean {
  const digest = createHash("sha256").update(codeVerifier).digest();
  const computed = digest
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  // Constant-time-ish: lengths equal + char compare. Values are non-secret
  // hashes, so a plain compare is acceptable here.
  return computed === codeChallenge;
}

/**
 * A redirect_uri is acceptable for DCR when it's https, or http on loopback
 * (localhost / 127.0.0.1) for local development. No fragments, no wildcards.
 */
export function isAllowedRedirectUri(uri: string): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.hash) return false;
  if (u.protocol === "https:") return true;
  if (
    u.protocol === "http:" &&
    (u.hostname === "localhost" || u.hostname === "127.0.0.1")
  ) {
    return true;
  }
  return false;
}
