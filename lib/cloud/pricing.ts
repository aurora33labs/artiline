import type { LicenseTier } from "@/lib/features";

export type PaidTier = Exclude<LicenseTier, "oss" | "free">;

export interface PricingPlan {
  tier: PaidTier;
  name: string;
  /** Charge currency base (what the Stripe USD price is set to). */
  priceUSD: number;
  /** Localized display amount for es / MX market. */
  priceMXN: number;
  interval: "month";
  /** Seat allowance; mirrors TIER_LIMITS. -1 = unlimited. */
  seats: number;
  /** false = shown as "coming soon", not sold yet. */
  available: boolean;
  description: string;
}

export const PRICING_PLANS: Record<PaidTier, PricingPlan> = {
  studio: {
    tier: "studio",
    name: "Studio",
    priceUSD: 20,
    priceMXN: 349,
    interval: "month",
    seats: 10,
    available: true,
    description:
      "Hosting gestionado para equipos que entregan AI artifacts a clientes.",
  },
  agency: {
    tier: "agency",
    name: "Agency",
    priceUSD: 99,
    priceMXN: 0,
    interval: "month",
    seats: 25,
    available: false,
    description: "White-label, dominio propio y tracking avanzado.",
  },
  agency_plus: {
    tier: "agency_plus",
    name: "Agency+",
    priceUSD: 399,
    priceMXN: 0,
    interval: "month",
    seats: -1,
    available: false,
    description: "SSO/SAML, retención de auditoría extendida y SLA.",
  },
};

/** Localized price label. Spanish → MXN, otherwise USD. */
export function planPrice(plan: PricingPlan, locale: string): string {
  if (locale === "es") return `$${plan.priceMXN.toLocaleString("es-MX")} MXN`;
  return `$${plan.priceUSD} USD`;
}

export function stripePriceId(tier: PaidTier): string | null {
  const env = `STRIPE_PRICE_${tier.toUpperCase()}`;
  return process.env[env] ?? null;
}
