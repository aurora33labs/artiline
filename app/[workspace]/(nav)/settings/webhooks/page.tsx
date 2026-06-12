import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireMemberPage } from "@/lib/tenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ALL_EVENTS } from "@/lib/webhooks/emit";
import {
  createWebhook,
  toggleWebhook,
  deleteWebhook,
} from "./actions";

export default async function WebhooksPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const { workspace } = await requireMemberPage(slug);

  const list = await db
    .select()
    .from(schema.webhooks)
    .where(eq(schema.webhooks.workspaceId, workspace.id))
    .orderBy(desc(schema.webhooks.createdAt));

  return (
    <div className="space-y-8 max-w-4xl">
      <header className="space-y-2 border-b border-border pb-6">
        <div className="meta">SETTINGS · WEBHOOKS</div>
        <h1 className="text-3xl">Webhooks</h1>
        <p className="text-muted-foreground text-sm">
          Suscríbete a eventos de tu workspace. Cada delivery se firma con HMAC
          SHA-256 (header <code>x-artiline-signature</code>).
        </p>
      </header>

      <section className="space-y-4 border border-border bg-surface p-6">
        <h2 className="text-base font-sans font-semibold normal-case tracking-normal">
          Nuevo webhook
        </h2>
        <form action={createWebhook} className="space-y-4">
          <input type="hidden" name="workspaceSlug" value={slug} />
          <div className="space-y-2">
            <Label htmlFor="url">Endpoint URL</Label>
            <Input
              id="url"
              name="url"
              type="url"
              required
              placeholder="https://hooks.example.com/artiline"
              className="h-11"
            />
          </div>
          <fieldset className="space-y-2">
            <legend className="meta">EVENTOS</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ALL_EVENTS.map((ev) => (
                <label
                  key={ev}
                  className="flex items-center gap-2 text-sm font-mono"
                >
                  <input
                    type="checkbox"
                    name="events"
                    value={ev}
                    defaultChecked
                    className="size-4 accent-primary"
                  />
                  {ev}
                </label>
              ))}
            </div>
          </fieldset>
          <Button type="submit">Crear webhook</Button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-sans font-semibold normal-case tracking-normal">
          Endpoints configurados ({list.length})
        </h2>
        {list.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aún no hay webhooks.</p>
        ) : (
          <ul className="border border-border bg-surface divide-y divide-border">
            {list.map((w) => (
              <li
                key={w.id}
                className="px-6 py-4 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`meta border px-2 py-0.5 ${w.enabled ? "text-success border-success" : "text-muted-foreground border-border"}`}
                    >
                      {w.enabled ? "ACTIVO" : "PAUSADO"}
                    </span>
                    <span className="font-mono text-sm truncate">{w.url}</span>
                  </div>
                  <div className="meta">
                    {w.events.join(" · ")} · SECRET{" "}
                    <code className="font-mono">{w.secret.slice(0, 8)}…</code>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <form action={toggleWebhook}>
                    <input type="hidden" name="workspaceSlug" value={slug} />
                    <input type="hidden" name="webhookId" value={w.id} />
                    <input
                      type="hidden"
                      name="enabled"
                      value={w.enabled ? "false" : "true"}
                    />
                    <Button type="submit" variant="ghost" size="sm">
                      {w.enabled ? "Pausar" : "Activar"}
                    </Button>
                  </form>
                  <form action={deleteWebhook}>
                    <input type="hidden" name="workspaceSlug" value={slug} />
                    <input type="hidden" name="webhookId" value={w.id} />
                    <Button type="submit" variant="outline" size="sm">
                      Eliminar
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
