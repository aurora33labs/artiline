"use server";

import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireMember, requireRole } from "@/lib/tenant";
import { isFeatureEnabled } from "@/lib/license";

export async function updateSsoConfig(formData: FormData) {
  const workspaceSlug = String(formData.get("workspaceSlug") ?? "");
  const { workspace, role } = await requireMember(workspaceSlug);
  requireRole(role, ["owner", "admin"]);

  if (!(await isFeatureEnabled("sso_saml", { workspaceId: workspace.id }))) {
    throw new Error("FEATURE_DISABLED");
  }

  const allowedDomains = String(formData.get("allowedDomains") ?? "")
    .split(/[\s,]+/)
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  const candidate = {
    provider: "saml" as const,
    entityID: String(formData.get("entityID") ?? "").trim(),
    ssoUrl: String(formData.get("ssoUrl") ?? "").trim(),
    x509cert: String(formData.get("x509cert") ?? "").trim(),
    attributeMap: {
      email: String(formData.get("attrEmail") ?? "email").trim() || "email",
      name: String(formData.get("attrName") ?? "").trim() || undefined,
    },
    allowedDomains,
  };

  // Validate against the canonical schema (cloud-only, dynamic import).
  const { samlConfigSchema } = await import("@/lib/cloud/sso");
  const config = samlConfigSchema.parse(candidate);

  const enabled = formData.get("enabled") === "on";

  await db
    .insert(schema.ssoConfigs)
    .values({
      workspaceId: workspace.id,
      provider: "saml",
      enabled,
      config,
    })
    .onConflictDoUpdate({
      target: schema.ssoConfigs.workspaceId,
      set: { provider: "saml", enabled, config, updatedAt: new Date() },
    });

  revalidatePath(`/${workspaceSlug}/settings/sso`);
}
