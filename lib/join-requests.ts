/**
 * Join-request helpers shared by the public /join page and the admin settings.
 * The allowed-domains list is a *gate on who may ask* — never an auto-approve.
 * Without email verification a domain match proves nothing, so an admin always
 * approves each request manually.
 */

/** Lowercase domain part of an email, or null if it has no `@`. */
export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase();
}

/**
 * Whether `email` may submit a join request given the workspace's allow-list.
 * Empty list = anyone may request.
 */
export function emailDomainAllowed(
  email: string,
  allowedDomains: string[],
): boolean {
  if (allowedDomains.length === 0) return true;
  const domain = emailDomain(email);
  if (!domain) return false;
  return allowedDomains.some((d) => d.toLowerCase() === domain);
}

/**
 * Parse a free-text domains field (comma- / newline- / space-separated) into a
 * normalized, de-duplicated list. Strips a leading `@` or `https://` and any
 * path, so pasted values like `@aurora33.app` or `aurora33.app/` still work.
 */
export function parseAllowedDomains(raw: string): string[] {
  const out = new Set<string>();
  for (const part of raw.split(/[\s,]+/)) {
    let d = part.trim().toLowerCase();
    if (!d) continue;
    d = d.replace(/^@/, "").replace(/^https?:\/\//, "").split("/")[0];
    // keep only plausible domains (has a dot, valid chars)
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) out.add(d);
  }
  return [...out];
}
