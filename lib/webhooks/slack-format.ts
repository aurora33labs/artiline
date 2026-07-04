import "server-only";

/**
 * Reformat an Artiline webhook payload as a Slack incoming-webhook message
 * (https://api.slack.com/messaging/webhooks) — no Slack app / OAuth required,
 * just a URL the workspace pastes in. Covers the common events with a
 * readable one-liner; anything else falls back to a generic key/value block
 * so a new event type never silently drops out of Slack delivery.
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

function slackText(event: string, p: Record<string, unknown>): string {
  const title = str(p.title) ?? str(p.slug) ?? "artifact";
  const slug = str(p.slug);
  const versionNumber = p.versionNumber != null ? `v${p.versionNumber}` : null;

  switch (event) {
    case "version.published":
      return `*Version published* — ${title}${versionNumber ? ` ${versionNumber}` : ""}`;
    case "version.proposed":
      return `*Version proposed* — ${title}${versionNumber ? ` ${versionNumber}` : ""}`;
    case "version.approved":
      return `*Version approved* — ${title}${versionNumber ? ` ${versionNumber}` : ""}`;
    case "version.changes_requested":
      return `*Changes requested* — ${title}${versionNumber ? ` ${versionNumber}` : ""}`;
    case "version.rolled_back":
      return `*Rolled back* — ${title}${p.toVersionNumber != null ? ` to v${p.toVersionNumber}` : ""}`;
    case "comment.created": {
      const author = str(p.authorName) ?? "Someone";
      const body = str(p.body);
      return `*${author} commented*${slug ? ` on ${slug}` : ""}${body ? `: ${truncate(body, 200)}` : ""}`;
    }
    case "artifact.viewed":
      return `*Artifact viewed* — ${title}`;
    case "artifact.deleted":
      return `*Artifact deleted* — ${title}`;
    default:
      return `*${event}*\n${Object.entries(p)
        .filter(([k]) => k !== "event" && k !== "ts")
        .map(([k, v]) => `• ${k}: ${String(v)}`)
        .join("\n")}`;
  }
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
