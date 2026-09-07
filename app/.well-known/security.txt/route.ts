import { getPublicUrl } from "mcp-handler";

export const runtime = "nodejs";

/**
 * Security contact for researchers (RFC 9116). Served from a route rather than
 * `public/` so the canonical URL matches whatever host the deployment answers
 * on — self-hosters get a correct file without editing anything.
 *
 * The contact mirrors SECURITY.md; a self-hoster can point it at their own
 * address with ARTILINE_SECURITY_CONTACT.
 *
 * Why this exists: two researchers who found the External Reviews flaw reported
 * it by leaving comments *inside the vulnerable app*, because there was nowhere
 * else to write. A findable address is what turns that into an email.
 */
const DEFAULT_CONTACT = "mailto:hola@aurora33.org";

/** RFC 9116 requires an expiry; keep it a rolling year from the request. */
function expiresAt(): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  d.setUTCMilliseconds(0);
  return d.toISOString().replace(".000", "");
}

export function GET(req: Request) {
  const origin = getPublicUrl(req).origin;
  const contact = process.env.ARTILINE_SECURITY_CONTACT ?? DEFAULT_CONTACT;

  const body = [
    `Contact: ${contact}`,
    `Expires: ${expiresAt()}`,
    "Preferred-Languages: es, en",
    `Canonical: ${origin}/.well-known/security.txt`,
    `Policy: https://github.com/aurora33labs/artiline/blob/main/SECURITY.md`,
    "",
    "# Please do not test against a deployment you do not operate.",
    "# Do not use a live instance's own features (comments, artifacts) to file",
    "# a report — email the address above instead.",
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
