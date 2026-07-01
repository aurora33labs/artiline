/**
 * Sanitize a post-login `callbackUrl` to a safe, same-origin relative path.
 *
 * Only same-origin relative paths are allowed: the value must start with a single
 * `/` and must NOT start with `//` (protocol-relative → other origin) or contain a
 * scheme (`https:`, `javascript:`, …). Anything else falls back to `fallback`.
 * This is the guard that lets the OAuth authorize flow bounce the user back to the
 * consent screen after login without becoming an open-redirect.
 */
const SCHEME_LIKE_FIRST_SEGMENT = /^\/[^/]*:/;

function hasControlChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 0x1f || c === 0x7f) return true;
  }
  return false;
}

export function sanitizeCallbackUrl(
  raw: string | null | undefined,
  fallback = "/",
): string {
  if (typeof raw !== "string" || raw.length === 0) return fallback;
  // Must be a relative path rooted at "/". Reject protocol-relative "//host".
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  // Reject backslash tricks, scheme-like first segments, and control chars.
  if (raw.includes("\\")) return fallback;
  if (SCHEME_LIKE_FIRST_SEGMENT.test(raw)) return fallback;
  if (hasControlChar(raw)) return fallback;
  return raw;
}
