"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Copy, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { rotateExternalKey, toggleExternalSite } from "@/app/[workspace]/(nav)/new/external/actions";

export type ExternalPage = {
  path: string;
  title: string | null;
  commentCount: number;
  stale: boolean;
  lastSeenAt: string | null;
};

export function ExternalSitePanel({
  workspaceSlug,
  artifactId,
  origin,
  publicKey,
  enabled,
  canManage,
  pages,
}: {
  workspaceSlug: string;
  artifactId: string;
  origin: string;
  publicKey: string;
  enabled: boolean;
  canManage: boolean;
  pages: ExternalPage[];
}) {
  const t = useTranslations("externalReview");
  const [copied, setCopied] = useState(false);
  const host = typeof window !== "undefined" ? window.location.origin : "";
  const snippet = `<script src="${host}/review.js" data-key="${publicKey}" defer></script>`;

  async function copySnippet() {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    toast.success(t("snippetCopied"));
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-6">
      <section className="border border-border bg-surface p-4 space-y-3">
        <div>
          <h2 className="text-sm font-sans font-semibold">{t("snippetTitle")}</h2>
          <p className="text-muted-foreground text-xs">{t("snippetBody")}</p>
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 min-w-0 truncate bg-background border border-border rounded px-2 py-1.5 text-xs font-mono">
            {snippet}
          </code>
          <Button size="sm" variant="outline" onClick={copySnippet}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {t("copySnippet")}
          </Button>
        </div>
        <div className="meta text-muted-foreground">{origin}</div>
        {canManage && (
          <div className="flex gap-2 pt-1">
            <form action={rotateExternalKey}>
              <input type="hidden" name="workspaceSlug" value={workspaceSlug} />
              <input type="hidden" name="artifactId" value={artifactId} />
              <Button type="submit" size="sm" variant="ghost">
                <RotateCw className="size-3.5" />
                {t("rotateKey")}
              </Button>
            </form>
            <form action={toggleExternalSite}>
              <input type="hidden" name="workspaceSlug" value={workspaceSlug} />
              <input type="hidden" name="artifactId" value={artifactId} />
              <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
              <Button type="submit" size="sm" variant="ghost">
                {enabled ? t("disable") : t("enable")}
              </Button>
            </form>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-sans font-semibold">{t("pagesTitle")}</h2>
        {pages.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noPages")}</p>
        ) : (
          <ol className="border border-border bg-surface divide-y divide-border">
            {pages.map((p) => (
              <li key={p.path} className="px-4 py-3 flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm">{p.path}</span>
                {p.title && <span className="text-muted-foreground text-xs">{p.title}</span>}
                {p.stale && (
                  <span className="meta text-warning border border-warning px-1.5 py-0.5">
                    {t("changedBadge")}
                  </span>
                )}
                <span className="meta ml-auto text-muted-foreground">
                  {p.commentCount} · {p.lastSeenAt ? new Date(p.lastSeenAt).toLocaleDateString() : "—"}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
