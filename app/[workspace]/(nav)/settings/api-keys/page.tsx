import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireMemberPage, requireRolePage } from "@/lib/tenant";
import { Download } from "lucide-react";
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
