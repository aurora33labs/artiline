export const TIER_ORDER = [
  "oss",
  "free",
  "studio",
  "agency",
  "agency_plus",
] as const;
export type LicenseTier = (typeof TIER_ORDER)[number];

export type Edition = "oss" | "cloud";

/**
 * Per-tier quotas. `-1` means unlimited.
 *
 * Only enforced in the cloud edition (see lib/limits.ts). Self-host (oss
 * edition) is never quota-limited — operators run their own infrastructure.
 */
export interface PlanLimits {
  members: number;
  artifacts: number;
}

export const TIER_LIMITS: Record<LicenseTier, PlanLimits> = {
  oss: { members: -1, artifacts: -1 },
  free: { members: 3, artifacts: 5 },
  studio: { members: 10, artifacts: 100 },
  agency: { members: 25, artifacts: -1 },
  agency_plus: { members: -1, artifacts: -1 },
};

export type Feature =
  | "versioning"
  | "review_mode"
  | "tracking_basic"
  | "webhooks_basic"
  | "embed_oembed"
  | "activity_log"
  | "search"
  | "ai_edit"
  | "custom_domain"
  | "white_label"
  | "tracking_advanced"
  | "sso_saml"
  | "audit_retention_extended"
  | "webhooks_monitored"
  | "slack_app"
  | "linear_app"
  | "branded_export"
  | "automatic_backups"
  | "priority_support";

export interface FeatureDef {
  core: boolean;
  minTier: LicenseTier;
  envOverride?: string;
}

export const FEATURES: Record<Feature, FeatureDef> = {
  versioning: { core: true, minTier: "oss" },
  review_mode: { core: true, minTier: "oss" },
  tracking_basic: { core: true, minTier: "oss" },
  webhooks_basic: { core: true, minTier: "oss" },
  embed_oembed: { core: true, minTier: "oss" },
  activity_log: { core: true, minTier: "oss" },
  search: { core: true, minTier: "oss" },
  // Always on; actually usable once the operator sets OPENROUTER_API_KEY +
  // ARTILINE_AI_MODEL_1/2/3 (lib/ai/openrouter.ts). Not gated by tier — the
  // operator brings and pays for their own OpenRouter key either way.
  ai_edit: { core: true, minTier: "oss" },

  custom_domain: {
    core: false,
    minTier: "agency",
    envOverride: "ARTILINE_ENABLE_CUSTOM_DOMAIN",
  },
  white_label: { core: false, minTier: "agency" },
  tracking_advanced: { core: false, minTier: "agency" },
  sso_saml: { core: false, minTier: "agency_plus" },
  audit_retention_extended: { core: false, minTier: "agency_plus" },
  // Recent-deliveries history + manual retry shipped as core (webhooks_basic) —
  // this flag is reserved for what's actually agency-tier: extended retention
  // and failure alerting (email/Slack ping when an endpoint keeps failing).
  webhooks_monitored: { core: false, minTier: "agency" },
  // Raw webhooks can already post to a Slack incoming-webhook URL (core,
  // lib/webhooks/slack-format.ts) with zero setup. This flag is reserved for a
  // real Slack App (OAuth install, slash commands) — not built yet.
  slack_app: { core: false, minTier: "agency" },
  linear_app: { core: false, minTier: "agency" },
  branded_export: { core: false, minTier: "agency" },
  automatic_backups: { core: false, minTier: "agency_plus" },
  priority_support: { core: false, minTier: "agency_plus" },
};

export function tierGte(a: LicenseTier, b: LicenseTier): boolean {
  return TIER_ORDER.indexOf(a) >= TIER_ORDER.indexOf(b);
}
