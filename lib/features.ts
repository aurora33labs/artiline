export const TIER_ORDER = ["oss", "studio", "agency", "agency_plus"] as const;
export type LicenseTier = (typeof TIER_ORDER)[number];

export type Edition = "oss" | "cloud";

export type Feature =
  | "versioning"
  | "review_mode"
  | "tracking_basic"
  | "webhooks_basic"
  | "embed_oembed"
  | "activity_log"
  | "search"
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

  custom_domain: {
    core: false,
    minTier: "agency",
    envOverride: "ARTILINE_ENABLE_CUSTOM_DOMAIN",
  },
  white_label: { core: false, minTier: "agency" },
  tracking_advanced: { core: false, minTier: "agency" },
  sso_saml: { core: false, minTier: "agency_plus" },
  audit_retention_extended: { core: false, minTier: "agency_plus" },
  webhooks_monitored: { core: false, minTier: "agency" },
  slack_app: { core: false, minTier: "agency" },
  linear_app: { core: false, minTier: "agency" },
  branded_export: { core: false, minTier: "agency" },
  automatic_backups: { core: false, minTier: "agency_plus" },
  priority_support: { core: false, minTier: "agency_plus" },
};

export function tierGte(a: LicenseTier, b: LicenseTier): boolean {
  return TIER_ORDER.indexOf(a) >= TIER_ORDER.indexOf(b);
}
