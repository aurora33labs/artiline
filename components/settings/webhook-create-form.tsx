"use client";

import { useActionState, useState } from "react";
import { Check, Copy, Webhook as WebhookIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ALL_EVENTS } from "@/lib/webhooks/emit";
import { createWebhook, type CreateWebhookState } from "@/app/[workspace]/(nav)/settings/webhooks/actions";

/** next-intl uses "." as a namespace separator, so keys use "_" instead. */
const evKey = (ev: string) => ev.replaceAll(".", "_");

export function WebhookCreateForm({ workspaceSlug }: { workspaceSlug: string }) {
  const t = useTranslations("webhooks");
  const tCommon = useTranslations("mcp"); // banner "cópialo ahora" genérico, ya usado por API keys
  const [state, action, pending] = useActionState<CreateWebhookState, FormData>(
    createWebhook,
    null,
  );
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <input type="hidden" name="workspaceSlug" value={workspaceSlug} />
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
                  <span className="font-medium">{t(`eventInfo.${evKey(ev)}.label`)}</span>
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
                <span className="block text-muted-foreground text-xs">{t("formatRawHint")}</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" name="format" value="slack" className="size-4 accent-primary mt-0.5" />
              <span>
                <span className="font-medium">{t("formatSlack")}</span>
                <span className="block text-muted-foreground text-xs">{t("formatSlackHint")}</span>
              </span>
            </label>
          </div>
        </fieldset>
        <Button type="submit" disabled={pending}>
          <WebhookIcon className="size-4" />
          {t("createBtn")}
        </Button>
      </form>

      {state && !state.ok && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      {state?.ok && (
        <div className="border border-success bg-success/5 p-4 space-y-3">
          <p className="text-sm text-muted-foreground">{tCommon("copyOnce")}</p>
          <div className="flex items-center gap-2">
            <code className="font-mono text-xs break-all bg-surface border border-border px-3 py-2 flex-1">
              {state.secret}
            </code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(state.secret);
                setCopied(true);
                toast.success(tCommon("copiedToast"));
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {tCommon("copyBtn")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
