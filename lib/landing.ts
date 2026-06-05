import { currentEdition } from "@/lib/license";

export type LandingMode = "marketing" | "app";

/**
 * Which homepage anonymous visitors see at `/`.
 *
 * - `marketing` — the public landing (the official artiline.app sets this).
 * - `app` — a minimal entry screen for self-hosted instances: sign in / create
 *   workspace, with first-run owner setup. No marketing copy.
 *
 * Explicit override via `NEXT_PUBLIC_ARTILINE_LANDING`. When unset, the default
 * follows the edition: cloud → marketing, oss (self-host) → app. So a self-host
 * install gets the simple entry out of the box with zero config.
 */
export function landingMode(): LandingMode {
  const v = process.env.NEXT_PUBLIC_ARTILINE_LANDING;
  if (v === "marketing" || v === "app") return v;
  return currentEdition() === "cloud" ? "marketing" : "app";
}
