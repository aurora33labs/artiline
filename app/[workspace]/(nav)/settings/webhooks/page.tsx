import { desc, eq, inArray } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db, schema } from "@/lib/db";
import { requireMemberPage, requireRolePage } from "@/lib/tenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ALL_EVENTS } from "@/lib/webhooks/emit";
import {
  createWebhook,
  toggleWebhook,
  deleteWebhook,
  retryDelivery,
} from "./actions";

const RECENT_DELIVERIES_PER_WEBHOOK = 25;

/** next-intl uses "." as a namespace separator, so keys use "_" instead. */
const evKey = (ev: string) => ev.replaceAll(".", "_");

export default async function WebhooksPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  // Workspace-level infra (not per-user): owner/admin only. Actions already
  // enforce this; the page guard keeps a member from reading webhook secrets
  // via a direct URL.
  const { workspace, role } = await requireMemberPage(slug);
  requireRolePage(role, ["owner", "admin"]);
  const t = await getTranslations("webhooks");

  const list = await db
    .select()
    .from(schema.webhooks)
    .where(eq(schema.webhooks.workspaceId, workspace.id))
    .orderBy(desc(schema.webhooks.createdAt));

  const webhookIds = list.map((w) => w.id);
  const recentDeliveries =
    webhookIds.length > 0
      ? await db
          .select()
          .from(schema.webhookDeliveries)
          .where(inArray(schema.webhookDeliveries.webhookId, webhookIds))
          .orderBy(desc(schema.webhookDeliveries.createdAt))
          .limit(webhookIds.length * RECENT_DELIVERIES_PER_WEBHOOK * 4)
      : [];
  const deliveriesByWebhook = new Map<string, typeof recentDeliveries>();
  for (const d of recentDeliveries) {
    const bucket = deliveriesByWebhook.get(d.webhookId) ?? [];
    if (bucket.length < RECENT_DELIVERIES_PER_WEBHOOK) bucket.push(d);
    deliveriesByWebhook.set(d.webhookId, bucket);
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <header className="space-y-2 border-b border-border pb-6">
        <div className="meta">{t("eyebrow")}</div>
        <h1 className="text-3xl">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">
          {t.rich("subtitle", { code: (chunks) => <code>{chunks}</code> })}
        </p>
      </header>

      <section className="space-y-4 border border-border bg-surface p-6">
        <h2 className="text-base font-sans font-semibold normal-case tracking-normal">
          {t("newWebhook")}
        </h2>
        <form action={createWebhook} className="space-y-4">
          <input type="hidden" name="workspaceSlug" value={slug} />
          <div className="space-y-2">
            <Label htmlFor="url">{t("endpointUrl")}</Label>
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
            <legend className="meta">{t("eventsLegend")}</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ALL_EVENTS.map((ev) => (
                <label key={ev} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="events"
                    value={ev}
                    defaultChecked
                    className="size-4 accent-primary mt-0.5"
                  />
                  <span>
                    <span className="font-medium">
                      {t(`eventInfo.${evKey(ev)}.label`)}
                    </span>
                    <span className="block text-muted-foreground text-xs">
                      {t(`eventInfo.${evKey(ev)}.desc`)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="meta">{t("formatLegend")}</legend>
            <div className="space-y-2">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="format"
                  value="raw"
                  defaultChecked
                  className="size-4 accent-primary mt-0.5"
                />
                <span>
                  <span className="font-medium">{t("formatRaw")}</span>
                  <span className="block text-muted-foreground text-xs">
                    {t("formatRawHint")}
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="format"
                  value="slack"
                  className="size-4 accent-primary mt-0.5"
                />
                <span>
                  <span className="font-medium">{t("formatSlack")}</span>
                  <span className="block text-muted-foreground text-xs">
                    {t("formatSlackHint")}
                  </span>
                </span>
              </label>
            </div>
          </fieldset>
          <Button type="submit">{t("createBtn")}</Button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-sans font-semibold normal-case tracking-normal">
          {t("configuredTitle", { count: list.length })}
        </h2>
        {list.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noWebhooks")}</p>
        ) : (
          <ul className="border border-border bg-surface divide-y divide-border">
            {list.map((w) => {
              const deliveries = deliveriesByWebhook.get(w.id) ?? [];
              return (
              <li
                key={w.id}
                className="px-6 py-4 flex flex-col gap-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`meta border px-2 py-0.5 ${w.enabled ? "text-success border-success" : "text-muted-foreground border-border"}`}
                      >
                        {w.enabled ? t("statusActive") : t("statusPaused")}
                      </span>
                      {w.format === "slack" && (
                        <span className="meta border border-border px-2 py-0.5">
                          SLACK
                        </span>
                      )}
                      <span className="font-mono text-sm truncate">{w.url}</span>
                    </div>
                    <div className="meta">
                      {w.events
                        .map((ev) => t(`eventInfo.${evKey(ev)}.label`))
                        .join(" · ")}{" "}
                      · SECRET{" "}
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
                        {w.enabled ? t("pause") : t("activate")}
                      </Button>
                    </form>
                    <form action={deleteWebhook}>
                      <input type="hidden" name="workspaceSlug" value={slug} />
                      <input type="hidden" name="webhookId" value={w.id} />
                      <Button type="submit" variant="outline" size="sm">
                        {t("delete")}
                      </Button>
                    </form>
                  </div>
                </div>

                <details className="text-sm">
                  <summary className="cursor-pointer meta text-muted-foreground">
                    {t("recentDeliveries")} ({deliveries.length})
                  </summary>
                  <div className="mt-2 space-y-1">
                    {deliveries.length === 0 ? (
                      <p className="text-muted-foreground text-xs">
                        {t("noDeliveries")}
                      </p>
                    ) : (
                      deliveries.map((d) => (
                        <div
                          key={d.id}
                          className="flex flex-wrap items-center gap-2 py-1 border-b border-border last:border-0 text-xs"
                        >
                          <span
                            className={`meta border px-1.5 py-0.5 ${
                              d.status === "success"
                                ? "text-success border-success"
                                : d.status === "failed"
                                  ? "text-destructive border-destructive"
                                  : "text-warning border-warning"
                            }`}
                          >
                            {t(`deliveryStatus.${d.status as "success" | "pending" | "failed"}`)}
                          </span>
                          <span>{t(`eventInfo.${evKey(d.event)}.label`)}</span>
                          {d.responseCode != null && (
                            <span className="text-muted-foreground">
                              HTTP {d.responseCode}
                            </span>
                          )}
                          <span className="text-muted-foreground">
                            {d.attempts}x
                          </span>
                          {d.lastError && (
                            <span className="text-muted-foreground truncate max-w-64">
                              {d.lastError}
                            </span>
                          )}
                          {d.status === "failed" && (
                            <form action={retryDelivery}>
                              <input type="hidden" name="workspaceSlug" value={slug} />
                              <input type="hidden" name="deliveryId" value={d.id} />
                              <Button type="submit" variant="ghost" size="sm" className="h-6 px-2">
                                {t("retry")}
                              </Button>
                            </form>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </details>
              </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
