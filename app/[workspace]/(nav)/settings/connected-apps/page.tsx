import { and, desc, eq, isNull } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { db, schema } from "@/lib/db";
import { requireMemberPage } from "@/lib/tenant";
import { Button } from "@/components/ui/button";
import { revokeConnectedApp } from "./actions";

function formatDate(d: Date | null, locale: string, never: string): string {
  if (!d) return never;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

type ConnectedApp = {
  clientId: string;
  clientName: string;
  scopes: string[];
  connectedAt: Date;
  lastUsedAt: Date | null;
};

/**
 * OAuth apps (e.g. the Claude.ai web connector) the current member has granted
 * access to this workspace. Per-user: any member sees and revokes their own
 * connections. Aggregated by client from the member's live access tokens.
 */
export default async function ConnectedAppsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const { workspace, session } = await requireMemberPage(slug);
  const t = await getTranslations("connectedApps");
  const locale = await getLocale();
  const never = t("never");

  const tokens = await db
    .select({
      clientId: schema.oauthAccessTokens.clientId,
      clientName: schema.oauthClients.clientName,
      scopes: schema.oauthAccessTokens.scopes,
      createdAt: schema.oauthAccessTokens.createdAt,
      lastUsedAt: schema.oauthAccessTokens.lastUsedAt,
    })
    .from(schema.oauthAccessTokens)
    .innerJoin(
      schema.oauthClients,
      eq(schema.oauthClients.id, schema.oauthAccessTokens.clientId),
    )
    .where(
      and(
        eq(schema.oauthAccessTokens.workspaceId, workspace.id),
        eq(schema.oauthAccessTokens.userId, session.user.id),
        isNull(schema.oauthAccessTokens.revokedAt),
      ),
    )
    .orderBy(desc(schema.oauthAccessTokens.createdAt));

  // Aggregate by client: earliest connection + latest use across its tokens.
  const byClient = new Map<string, ConnectedApp>();
  for (const tok of tokens) {
    const existing = byClient.get(tok.clientId);
    if (!existing) {
      byClient.set(tok.clientId, {
        clientId: tok.clientId,
        clientName: tok.clientName ?? "",
        scopes: tok.scopes,
        connectedAt: tok.createdAt,
        lastUsedAt: tok.lastUsedAt,
      });
    } else {
      if (tok.createdAt < existing.connectedAt)
        existing.connectedAt = tok.createdAt;
      if (
        tok.lastUsedAt &&
        (!existing.lastUsedAt || tok.lastUsedAt > existing.lastUsedAt)
      ) {
        existing.lastUsedAt = tok.lastUsedAt;
      }
    }
  }
  const apps = [...byClient.values()];

  return (
    <div className="space-y-8 max-w-4xl">
      <header className="space-y-2 border-b border-border pb-6">
        <div className="meta">{t("eyebrow")}</div>
        <h1 className="text-3xl">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-base font-sans font-semibold normal-case tracking-normal">
          {t("connectionsTitle", { count: apps.length })}
        </h2>
        {apps.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noConnections")}</p>
        ) : (
          <ul className="border border-border bg-surface divide-y divide-border">
            {apps.map((a) => (
              <li
                key={a.clientId}
                className="px-6 py-4 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <span className="font-mono text-sm truncate">
                    {a.clientName || t("unnamedApp")}
                  </span>
                  <div className="meta">
                    {a.scopes.join(", ")} · {t("connected")}{" "}
                    {formatDate(a.connectedAt, locale, never)} · {t("used")}{" "}
                    {formatDate(a.lastUsedAt, locale, never)}
                  </div>
                </div>
                <form action={revokeConnectedApp}>
                  <input type="hidden" name="workspaceSlug" value={slug} />
                  <input type="hidden" name="clientId" value={a.clientId} />
                  <Button type="submit" variant="outline" size="sm">
                    {t("revoke")}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
