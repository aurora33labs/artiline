import "server-only";

/**
 * Reformat an Artiline webhook payload as a Slack incoming-webhook message
 * (https://api.slack.com/messaging/webhooks) — no Slack app / OAuth required,
 * just a URL the workspace pastes in. Covers the common events with a
 * readable one-liner; anything else falls back to a generic key/value block
 * so a new event type never silently drops out of Slack delivery.
 *
 * Payload fields are attacker-controllable: a comment's `authorName` and `body`
 * can come from an unauthenticated visitor. Everything interpolated from the
 * payload therefore goes through `esc()` — an unescaped `<https://evil/|Re-auth
 * here>` would render in the channel as a real link, indistinguishable from the
 * one we build ourselves below.
 */
export function toSlackPayload(
  event: string,
  payload: Record<string, unknown>,
): { text: string; blocks: unknown[] } {
  const text = slackText(event, payload);
  return {
    text,
    blocks: [{ type: "section", text: { type: "mrkdwn", text } }],
  };
}

/**
 * Escape the three characters Slack treats as markup control characters
 * (https://api.slack.com/reference/surfaces/formatting#escaping). `&` must be
 * replaced first or it would double-escape the entities produced after it.
 */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function slackText(event: string, p: Record<string, unknown>): string {
  // Raw slug is used to build our own link; the displayed copy is escaped.
  const rawSlug = str(p.slug);
  const title = esc(str(p.title) ?? rawSlug ?? "artifact");
  const slug = rawSlug ? esc(rawSlug) : null;
  const versionNumber = p.versionNumber != null ? `v${esc(String(p.versionNumber))}` : null;
  const actorName = str(p.actorName) ?? str(p.authorName);
  const actorLine = actorName ? `\nBy: ${esc(actorName)}` : "";
  const url =
    rawSlug && process.env.AUTH_URL
      ? `${process.env.AUTH_URL}/a/${rawSlug}`
      : null;
  const linkLine = url ? `\n<${url}|View artifact →>` : "";

  switch (event) {
    case "artifact.created":
      return `*Artifact created* — ${title}${actorLine}${linkLine}`;
    case "version.published":
      return `*Version published* — ${title}${versionNumber ? ` ${versionNumber}` : ""}${actorLine}${linkLine}`;
    case "version.proposed":
      return `*Version proposed* — ${title}${versionNumber ? ` ${versionNumber}` : ""}${actorLine}${linkLine}`;
    case "version.approved":
      return `*Version approved* — ${title}${versionNumber ? ` ${versionNumber}` : ""}${actorLine}${linkLine}`;
    case "version.changes_requested":
      return `*Changes requested* — ${title}${versionNumber ? ` ${versionNumber}` : ""}${actorLine}${linkLine}`;
    case "version.rolled_back":
      return `*Rolled back* — ${title}${p.toVersionNumber != null ? ` to v${esc(String(p.toVersionNumber))}` : ""}${actorLine}${linkLine}`;
    case "comment.created": {
      const author = esc(str(p.authorName) ?? "Someone");
      const body = str(p.body);
      return `*${author} commented*${slug ? ` on ${slug}` : ""}${body ? `: ${esc(truncate(body, 200))}` : ""}${linkLine}`;
    }
    case "artifact.viewed":
      return `*Artifact viewed* — ${title}`;
    case "artifact.deleted":
      return `*Artifact deleted* — ${title}${actorLine}`;
    default:
      return `*${esc(event)}*\n${Object.entries(p)
        .filter(([k]) => k !== "event" && k !== "ts")
        .map(([k, v]) => `• ${esc(k)}: ${esc(String(v))}`)
        .join("\n")}`;
  }
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
