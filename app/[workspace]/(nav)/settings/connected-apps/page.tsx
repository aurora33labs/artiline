import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireMemberPage } from "@/lib/tenant";
import { Button } from "@/components/ui/button";
import { revokeConnectedApp } from "./actions";

function formatDate(d: Date | null): string {
  if (!d) return "nunca";
  return new Intl.DateTimeFormat("es", {
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
  for (const t of tokens) {
    const existing = byClient.get(t.clientId);
    if (!existing) {
      byClient.set(t.clientId, {
        clientId: t.clientId,
        clientName: t.clientName ?? "Aplicación sin nombre",
        scopes: t.scopes,
        connectedAt: t.createdAt,
        lastUsedAt: t.lastUsedAt,
      });
    } else {
      if (t.createdAt < existing.connectedAt) existing.connectedAt = t.createdAt;
      if (
        t.lastUsedAt &&
        (!existing.lastUsedAt || t.lastUsedAt > existing.lastUsedAt)
      ) {
        existing.lastUsedAt = t.lastUsedAt;
      }
    }
  }
  const apps = [...byClient.values()];

  return (
    <div className="space-y-8 max-w-4xl">
      <header className="space-y-2 border-b border-border pb-6">
        <div className="meta">SETTINGS · APPS CONECTADAS</div>
        <h1 className="text-3xl">Apps conectadas</h1>
        <p className="text-muted-foreground text-sm">
          Aplicaciones OAuth (como el conector de Claude.ai) a las que diste
          acceso a este workspace. Revocar corta la conexión de inmediato.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-base font-sans font-semibold normal-case tracking-normal">
          Conexiones ({apps.length})
        </h2>
        {apps.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No has conectado ninguna aplicación.
          </p>
        ) : (
          <ul className="border border-border bg-surface divide-y divide-border">
            {apps.map((a) => (
              <li
                key={a.clientId}
                className="px-6 py-4 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <span className="font-mono text-sm truncate">
                    {a.clientName}
                  </span>
                  <div className="meta">
                    {a.scopes.join(", ")} · conectada {formatDate(a.connectedAt)}{" "}
                    · usada {formatDate(a.lastUsedAt)}
                  </div>
                </div>
                <form action={revokeConnectedApp}>
                  <input type="hidden" name="workspaceSlug" value={slug} />
                  <input type="hidden" name="clientId" value={a.clientId} />
                  <Button type="submit" variant="outline" size="sm">
                    Revocar
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
