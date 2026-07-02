"use client";

import { useActionState, useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createApiKey, type CreateKeyState } from "@/app/[workspace]/(nav)/settings/api-keys/actions";

export function ApiKeyCreateForm({ workspaceSlug }: { workspaceSlug: string }) {
  const t = useTranslations("mcp");
  const [state, action, pending] = useActionState<CreateKeyState, FormData>(
    createApiKey,
    null,
  );
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <input type="hidden" name="workspaceSlug" value={workspaceSlug} />
        <div className="space-y-2">
          <Label htmlFor="name">{t("nameLabel")}</Label>
          <Input
            id="name"
            name="name"
            required
            maxLength={80}
            placeholder={t("namePlaceholder")}
            className="h-11"
          />
          <p className="text-xs text-muted-foreground">{t("nameHint")}</p>
        </div>
        <Button type="submit" disabled={pending}>
          <KeyRound className="size-4" />
          {pending ? t("generating") : t("generateBtn")}
        </Button>
      </form>

      {state && !state.ok && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      {state?.ok && (
        <div className="border border-success bg-success/5 p-4 space-y-3">
          <div className="meta text-success">
            {t("createdBadge", { name: state.name })}
          </div>
          <p className="text-sm text-muted-foreground">{t("copyOnce")}</p>
          <div className="flex items-center gap-2">
            <code className="font-mono text-xs break-all bg-surface border border-border px-3 py-2 flex-1">
              {state.token}
            </code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(state.token);
                setCopied(true);
                toast.success(t("copiedToast"));
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {t("copyBtn")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
