import { isFeatureEnabled, currentEdition } from "@/lib/license";
import type { Feature } from "@/lib/features";

/**
 * Server component wrapper for feature-gated UI.
 *
 * - In OSS edition: renders `null` if feature is paid and not enabled (no
 *   confusing upgrade CTAs in self-host).
 * - In cloud edition: renders `null` if feature unavailable, or `fallback`
 *   (typically an upgrade CTA) if provided.
 *
 * For core features, always renders children (no gating).
 */
export async function Gated({
  feature,
  workspaceId,
  fallback = null,
  children,
}: {
  feature: Feature;
  workspaceId?: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const enabled = await isFeatureEnabled(feature, { workspaceId });
  if (enabled) return <>{children}</>;
  if (currentEdition() === "cloud") return <>{fallback}</>;
  return null;
}
