import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireMemberPage } from "@/lib/tenant";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiKeyCreateForm } from "@/components/settings/api-key-create-form";
import { MEMBER_KEY_LIMIT } from "@/lib/api-keys";
import { revokeApiKey } from "./actions";

function formatDate(d: Date | null): string {
  if (!d) return "nunca";
  return new Intl.DateTimeFormat("es", {
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

  return (
    <div className="space-y-8 max-w-4xl">
      <header className="space-y-2 border-b border-border pb-6">
        <div className="meta">SETTINGS · MCP</div>
        <h1 className="text-3xl">MCP</h1>
        <p className="text-muted-foreground text-sm">
          Conecta Claude a tu workspace vía MCP. Genera un token, úsalo en la
          extensión de Claude Desktop y crea artifacts desde cualquier chat. Cada
          token está limitado a este workspace y hereda tu identidad.
        </p>
      </header>

      <section className="space-y-4 border border-border bg-surface p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-sans font-semibold normal-case tracking-normal">
            Nuevo token
          </h2>
          {!canManageAll && (
            <span className="meta">
              {myActiveCount}/{MEMBER_KEY_LIMIT} activos
            </span>
          )}
        </div>
        {atLimit ? (
          <p className="text-sm text-muted-foreground">
            Alcanzaste el límite de {MEMBER_KEY_LIMIT} tokens MCP activos. Revoca
            uno abajo para crear otro.
          </p>
        ) : (
          <ApiKeyCreateForm workspaceSlug={slug} />
        )}
      </section>

      <section className="space-y-3 border border-border bg-surface p-6">
        <h2 className="text-base font-sans font-semibold normal-case tracking-normal">
          Claude Desktop (un clic)
        </h2>
        <p className="text-muted-foreground text-sm">
          La forma más fácil de conectar. Descarga la extensión, ábrela en Claude
          Desktop y pega tu token cuando te lo pida.
        </p>
        <ol className="text-sm text-muted-foreground list-decimal pl-5 space-y-1">
          <li>Genera un token arriba y cópialo.</li>
          <li>Descarga la extensión y ábrela (doble clic).</li>
          <li>
            Claude Desktop te pedirá el «Artiline API token» → pégalo. Listo.
          </li>
        </ol>
        <a href="/api/mcpb" download>
          <Button type="button">
            <Download className="size-4" />
            Descargar extensión (.mcpb)
          </Button>
        </a>
        <p className="text-xs text-muted-foreground">
          Requiere Claude Desktop. Luego, en cualquier chat: «guarda este HTML en
          Artiline» → Claude llama a <code>create_artifact</code>.
        </p>
      </section>

      <section className="space-y-3 border border-border bg-surface p-6">
        <h2 className="text-base font-sans font-semibold normal-case tracking-normal">
          Avanzado · URL del servidor MCP
        </h2>
        <p className="text-muted-foreground text-sm">
          Para Claude Code (<code>claude mcp add</code>) u otros clientes MCP. El
          conector OAuth de la app web de Claude tiene un bug abierto de Anthropic
          y hoy no es confiable — usa la extensión de arriba para Claude Desktop.
        </p>
        <code className="block font-mono text-xs bg-background border border-border px-3 py-2">
          {mcpUrl}
        </code>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-sans font-semibold normal-case tracking-normal">
          Tokens ({list.length})
        </h2>
        {list.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aún no hay tokens.</p>
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
                        {revoked ? "REVOCADO" : "ACTIVO"}
                      </span>
                      <span className="font-mono text-sm truncate">
                        {k.name}
                      </span>
                    </div>
                    <div className="meta">
                      <code className="font-mono">{k.tokenPrefix}…</code> ·{" "}
                      {k.role} · creado {formatDate(k.createdAt)} · usado{" "}
                      {formatDate(k.lastUsedAt)}
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
                        Revocar
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
