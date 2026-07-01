import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireMemberPage, requireRolePage } from "@/lib/tenant";
import { Button } from "@/components/ui/button";
import { ApiKeyCreateForm } from "@/components/settings/api-key-create-form";
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
  const { workspace, role } = await requireMemberPage(slug);
  requireRolePage(role, ["owner", "admin"]);

  const list = await db
    .select()
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.workspaceId, workspace.id))
    .orderBy(desc(schema.apiKeys.createdAt));

  const mcpUrl = `${process.env.AUTH_URL ?? "https://<tu-dominio>"}/api/mcp`;

  return (
    <div className="space-y-8 max-w-4xl">
      <header className="space-y-2 border-b border-border pb-6">
        <div className="meta">SETTINGS · API KEYS</div>
        <h1 className="text-3xl">API keys</h1>
        <p className="text-muted-foreground text-sm">
          Tokens para crear artifacts por programa — por ejemplo desde Claude vía
          MCP. Cada token está limitado a este workspace y hereda tu identidad.
        </p>
      </header>

      <section className="space-y-4 border border-border bg-surface p-6">
        <h2 className="text-base font-sans font-semibold normal-case tracking-normal">
          Nuevo token
        </h2>
        <ApiKeyCreateForm workspaceSlug={slug} />
      </section>

      <section className="space-y-3 border border-border bg-surface p-6">
        <h2 className="text-base font-sans font-semibold normal-case tracking-normal">
          Conectar Claude (MCP)
        </h2>
        <p className="text-muted-foreground text-sm">
          En Claude.ai → Settings → Connectors → Add custom connector, pega esta
          URL y usa el token como Bearer. Funciona igual en Claude Desktop y
          Claude Code. Luego, en cualquier chat: «guarda este artifact en
          Artiline».
        </p>
        <code className="block font-mono text-xs bg-background border border-border px-3 py-2">
          {mcpUrl}
        </code>
        <p className="text-xs text-muted-foreground">
          Un artifact dentro de un chat no puede exportarse solo: Claude debe
          llamar a la tool <code>create_artifact</code> (vía este conector) o
          puedes copiar el código fuente y pegarlo en{" "}
          <code>/{slug}/new</code>.
        </p>
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
