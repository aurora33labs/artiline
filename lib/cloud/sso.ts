import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";

/**
 * SSO/SAML provider config schema.
 *
 * SAML is fully wired via @node-saml/node-saml (see lib/cloud/saml.ts). The
 * config is stored per-workspace in sso_configs.config (jsonb). OIDC remains a
 * follow-up; its schema is kept here for forward compatibility.
 */
export const samlConfigSchema = z.object({
  provider: z.literal("saml"),
  /** IdP entityID / issuer. */
  entityID: z.url(),
  /** IdP SSO endpoint (HTTP-Redirect or HTTP-POST). */
  ssoUrl: z.url(),
  /** IdP signing certificate (PEM body, base64). */
  x509cert: z.string().min(64),
  attributeMap: z
    .object({
      email: z.string().default("email"),
      name: z.string().default("name").optional(),
    })
    .default({ email: "email" }),
  /**
   * Email domains allowed to JIT-provision into the workspace. An email whose
   * domain is not listed is rejected unless the user is already a member.
   */
  allowedDomains: z.array(z.string().toLowerCase()).default([]),
});

export const oidcConfigSchema = z.object({
  provider: z.literal("oidc"),
  issuer: z.url(),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  scopes: z.array(z.string()).default(["openid", "profile", "email"]),
});

export type SamlConfig = z.infer<typeof samlConfigSchema>;
export type OidcConfig = z.infer<typeof oidcConfigSchema>;
export type SsoConfig = SamlConfig | OidcConfig;

export type ResolvedWorkspaceSso = {
  workspace: typeof schema.workspaces.$inferSelect;
  enabled: boolean;
  config: SamlConfig;
};

/**
 * Load a workspace + its SAML config by slug. Returns null when the workspace
 * does not exist, has no SSO config, or the config is not a valid SAML config.
 * Does not check the `enabled` flag or the feature gate — callers decide.
 */
export async function resolveWorkspaceSso(
  slug: string,
): Promise<ResolvedWorkspaceSso | null> {
  const [workspace] = await db
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.slug, slug))
    .limit(1);
  if (!workspace) return null;

  const [row] = await db
    .select()
    .from(schema.ssoConfigs)
    .where(eq(schema.ssoConfigs.workspaceId, workspace.id))
    .limit(1);
  if (!row || row.provider !== "saml") return null;

  const parsed = samlConfigSchema.safeParse(row.config);
  if (!parsed.success) return null;

  return { workspace, enabled: row.enabled, config: parsed.data };
}
