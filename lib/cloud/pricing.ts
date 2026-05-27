import type { LicenseTier } from "@/lib/features";

export const PRICING_PLANS = {
  studio: {
    tier: "studio" as const,
    name: "Studio",
    price: 29,
    interval: "month",
    seats: 5,
    description: "Pequeñas agencias o equipos in-house arrancando.",
  },
  agency: {
    tier: "agency" as const,
    name: "Agency",
    price: 149,
    interval: "month",
    seats: 20,
    description: "Custom domain + white-label + tracking avanzado.",
  },
  agency_plus: {
    tier: "agency_plus" as const,
    name: "Agency+",
    price: 499,
    interval: "month",
    seats: 50,
    description: "SSO/SAML + audit retention extendido + priority SLA.",
  },
} satisfies Record<
  Exclude<LicenseTier, "oss" | "free">,
  {
    tier: LicenseTier;
    name: string;
    price: number;
    interval: "month";
    seats: number;
    description: string;
  }
>;

export type PricingPlan = (typeof PRICING_PLANS)[keyof typeof PRICING_PLANS];

export function stripePriceId(
  tier: Exclude<LicenseTier, "oss" | "free">,
): string | null {
  const env = `STRIPE_PRICE_${tier.toUpperCase()}`;
  return process.env[env] ?? null;
}
