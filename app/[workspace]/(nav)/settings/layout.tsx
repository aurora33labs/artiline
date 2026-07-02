import { and, count, eq, isNull } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db, schema } from "@/lib/db";
import { requireMemberPage } from "@/lib/tenant";
import { currentEdition, isFeatureEnabled } from "@/lib/license";
import { SettingsTabs, type SettingsTab } from "@/components/settings/settings-tabs";

/**
 * Shared chrome for the workspace settings pages: a sub-nav exposing the
 * otherwise-orphaned sub-pages, which nothing else links to. Tabs are filtered
 * by role/edition/ownership so we never show one that would 403/`notFound()`:
 *  - MCP (api-keys): per-user credential, every member sees it.
 *  - Connected apps: per-user OAuth grants — shown only when the user has ≥1.
 *  - Members / Webhooks / SSO: workspace admin, owner/admin only.
 */
export default async function SettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const { workspace, role, session } = await requireMemberPage(slug);
  const t = await getTranslations("settings.tabs");
  const canManage = role === "owner" || role === "admin";

  // Per-user OAuth connections — the Connected apps tab only makes sense if the
  // current user actually has one (it lists/revokes their own grants).
  const [{ n: connectedCount }] = await db
    .select({ n: count() })
    .from(schema.oauthAccessTokens)
    .where(
      and(
        eq(schema.oauthAccessTokens.workspaceId, workspace.id),
        eq(schema.oauthAccessTokens.userId, session.user.id),
        isNull(schema.oauthAccessTokens.revokedAt),
      ),
    );

  const base = `/${slug}/settings`;
  const tabs: SettingsTab[] = [];

  // Members management lives at the settings root — admin only.
  if (canManage) tabs.push({ href: base, label: t("general") });
  // MCP tokens: every member manages their own.
  tabs.push({ href: `${base}/api-keys`, label: t("apiKeys") });
  if (connectedCount > 0)
    tabs.push({ href: `${base}/connected-apps`, label: t("connectedApps") });

  if (canManage) {
    tabs.push({ href: `${base}/webhooks`, label: t("webhooks") });

    // SSO is a gated cloud feature — its page `notFound()`s in OSS when disabled.
    const ssoEnabled =
      currentEdition() !== "oss" ||
      (await isFeatureEnabled("sso_saml", { workspaceId: workspace.id }));
    if (ssoEnabled) tabs.push({ href: `${base}/sso`, label: t("sso") });
  }

  return (
    <div className="space-y-8">
      <SettingsTabs tabs={tabs} />
      {children}
    </div>
  );
}
