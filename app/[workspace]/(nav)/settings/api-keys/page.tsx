import { and, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { db, schema } from "@/lib/db";
import { requireMemberPage } from "@/lib/tenant";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiKeyCreateForm } from "@/components/settings/api-key-create-form";
import { McpInstallSteps } from "@/components/settings/mcp-install-steps";
import { MEMBER_KEY_LIMIT } from "@/lib/api-keys";
import { revokeApiKey } from "./actions";

/** Small numbered chip used to mark each step of the connect flow. */
function StepChip({ n }: { n: number }) {
  return (
    <span className="size-6 shrink-0 rounded-full border border-border-strong bg-surface-2 text-foreground font-display text-xs font-bold flex items-center justify-center">
      {n}
    </span>
  );
}

function formatDate(d: Date | null, locale: string, never: string): string {
  if (!d) return never;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export default async function ApiKeysPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const { workspace, role, session } = await requireMemberPage(slug);
  const t = await getTranslations("mcp");
  const locale = await getLocale();
  const never = t("never");
  // Any member manages their own keys; owner/admin see the whole workspace's.
  const canManageAll = role === "owner" || role === "admin";
  const myUserId = session.user.id;

  const list = await db
    .select({
      id: schema.apiKeys.id,
      name: schema.apiKeys.name,
      tokenPrefix: schema.apiKeys.tokenPrefix,
      role: schema.apiKeys.role,
      createdAt: schema.apiKeys.createdAt,
      lastUsedAt: schema.apiKeys.lastUsedAt,
      revokedAt: schema.apiKeys.revokedAt,
      userId: schema.apiKeys.userId,
      ownerEmail: schema.users.email,
    })
    .from(schema.apiKeys)
    .innerJoin(schema.users, eq(schema.users.id, schema.apiKeys.userId))
    .where(
      canManageAll
        ? eq(schema.apiKeys.workspaceId, workspace.id)
        : and(
            eq(schema.apiKeys.workspaceId, workspace.id),
            eq(schema.apiKeys.userId, myUserId),
          ),
    )
    .orderBy(desc(schema.apiKeys.createdAt));

  const mcpUrl = `${process.env.AUTH_URL ?? "https://<tu-dominio>"}/api/mcp`;

  // Members are capped to MEMBER_KEY_LIMIT active tokens; owner/admin unlimited.
  const myActiveCount = list.filter(
    (k) => k.userId === myUserId && k.revokedAt == null,
  ).length;
  const atLimit = !canManageAll && myActiveCount >= MEMBER_KEY_LIMIT;

  // Preselect the install tab from the user-agent (toggle still manual).
  const ua = (await headers()).get("user-agent") ?? "";
  const defaultOs = /windows/i.test(ua) ? "win" : "mac";

  return (
    <div className="space-y-8 max-w-4xl">
      <header className="space-y-2 border-b border-border pb-6">
        <div className="meta">{t("eyebrow")}</div>
        <h1 className="text-3xl">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </header>

      <section className="border border-border bg-surface">
        <h2 className="text-base font-sans font-semibold normal-case tracking-normal border-b border-border px-6 py-4">
          {t("connectTitle")}
        </h2>

        <div className="divide-y divide-border">
          {/* Paso 1 — Descargar */}
          <div className="flex gap-4 px-6 py-5">
            <StepChip n={1} />
            <div className="space-y-3 min-w-0">
              <div className="space-y-1">
                <h3 className="text-sm font-medium">{t("step1Title")}</h3>
                <p className="text-sm text-muted-foreground">{t("step1Body")}</p>
              </div>
              <a href="/api/mcpb" download>
                <Button type="button">
                  <Download className="size-4" />
                  {t("downloadBtn")}
                </Button>
              </a>
            </div>
          </div>

          {/* Paso 2 — Generar token */}
          <div className="flex gap-4 px-6 py-5">
            <StepChip n={2} />
            <div className="space-y-3 min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <h3 className="text-sm font-medium">{t("step2Title")}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t("step2Body")}
                  </p>
                </div>
                {!canManageAll && (
                  <span className="meta shrink-0">
                    {t("activeCount", {
                      count: myActiveCount,
                      limit: MEMBER_KEY_LIMIT,
                    })}
                  </span>
                )}
              </div>
              {atLimit ? (
                <p className="text-sm text-muted-foreground">
                  {t("limitReached", { limit: MEMBER_KEY_LIMIT })}
                </p>
              ) : (
                <ApiKeyCreateForm workspaceSlug={slug} />
              )}
            </div>
          </div>

          {/* Paso 3 — Instalar en Claude Desktop (por SO) */}
          <div className="flex gap-4 px-6 py-5">
            <StepChip n={3} />
            <div className="space-y-3 min-w-0 flex-1">
              <h3 className="text-sm font-medium">{t("step3Title")}</h3>
              <McpInstallSteps defaultOs={defaultOs} />
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-2 border border-border bg-surface p-6">
        <h2 className="text-base font-sans font-semibold normal-case tracking-normal">
          {t("usageTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t.rich("usageHint", { code: (chunks) => <code>{chunks}</code> })}
        </p>
      </section>

      <section className="space-y-4 border border-border bg-surface p-6">
        <h2 className="text-base font-sans font-semibold normal-case tracking-normal">
          {t("advancedTitle")}
        </h2>
        <p className="text-muted-foreground text-sm">
          {t.rich("advancedDesc", {
            code: (chunks) => <code>{chunks}</code>,
          })}
        </p>
        <code className="block font-mono text-xs bg-background border border-border px-3 py-2">
          {mcpUrl}
        </code>

        <div className="space-y-2 pt-2 border-t border-border">
          <h3 className="text-sm font-medium">{t("claudeCodeTitle")}</h3>
          <p className="text-sm text-muted-foreground">
            {t.rich("claudeCodeDesc", {
              code: (chunks) => <code className="font-mono text-[0.85em]">{chunks}</code>,
            })}
          </p>
          <code className="block font-mono text-xs bg-background border border-border px-3 py-2 break-all">
            {`claude mcp add artiline --transport http "${mcpUrl}" --header "Authorization: Bearer artl_YOUR_TOKEN"`}
          </code>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-sans font-semibold normal-case tracking-normal">
          {t("tokensTitle", { count: list.length })}
        </h2>
        {list.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noTokens")}</p>
        ) : (
          <ul className="border border-border bg-surface divide-y divide-border">
            {list.map((k) => {
              const revoked = k.revokedAt != null;
              const active = !revoked;
              return (
                <li
                  key={k.id}
                  className="px-6 py-4 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`meta border px-2 py-0.5 ${active ? "text-success border-success" : "text-muted-foreground border-border"}`}
                      >
                        {revoked ? t("statusRevoked") : t("statusActive")}
                      </span>
                      <span className="font-mono text-sm truncate">
                        {k.name}
                      </span>
                    </div>
                    <div className="meta">
                      <code className="font-mono">{k.tokenPrefix}…</code> ·{" "}
                      {k.role} · {t("created")}{" "}
                      {formatDate(k.createdAt, locale, never)} · {t("used")}{" "}
                      {formatDate(k.lastUsedAt, locale, never)}
                      {canManageAll && k.userId !== myUserId && (
                        <> · {k.ownerEmail}</>
                      )}
                    </div>
                  </div>
                  {active && (
                    <form action={revokeApiKey}>
                      <input type="hidden" name="workspaceSlug" value={slug} />
                      <input type="hidden" name="keyId" value={k.id} />
                      <Button type="submit" variant="outline" size="sm">
                        {t("revoke")}
                      </Button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
