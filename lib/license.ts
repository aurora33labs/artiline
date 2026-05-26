import "server-only";
import { FEATURES, tierGte, type Feature, type LicenseTier, type Edition } from "./features";
import { verifyLicenseJWT } from "./license/verify";

const EDITION: Edition =
  (process.env.NEXT_PUBLIC_ARTILINE_EDITION as Edition | undefined) ?? "oss";

export interface ResolvedLicense {
  edition: Edition;
  tier: LicenseTier;
  workspaceId?: string;
  expiresAt?: Date;
}

export async function resolveLicense(workspaceId?: string): Promise<ResolvedLicense> {
  if (EDITION === "oss") {
    const key = process.env.LICENSE_KEY;
    if (!key) return { edition: "oss", tier: "oss" };
    const v = await verifyLicenseJWT(key);
    if (!v.ok) return { edition: "oss", tier: "oss" };
    return { edition: "oss", tier: v.tier, expiresAt: v.expiresAt };
  }
  const { tierForWorkspace } = await import("./cloud/billing");
  const tier = workspaceId ? await tierForWorkspace(workspaceId) : "studio";
  return { edition: "cloud", tier, workspaceId };
}

export async function isFeatureEnabled(
  feature: Feature,
  ctx?: { workspaceId?: string },
): Promise<boolean> {
  const def = FEATURES[feature];
  if (def.core) return true;
  if (def.envOverride && process.env[def.envOverride] === "1") return true;
  const lic = await resolveLicense(ctx?.workspaceId);
  if (lic.expiresAt && lic.expiresAt < new Date()) return false;
  return tierGte(lic.tier, def.minTier);
}

export function currentEdition(): Edition {
  return EDITION;
}
