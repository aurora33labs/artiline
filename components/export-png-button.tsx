"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ImageDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

export function ExportPngButton({ artifactId }: { artifactId: string }) {
  const [loading, setLoading] = useState(false);
  const t = useTranslations("viewer");
  const tt = useTranslations("toasts");
  const te = useTranslations("errors");

  function translateError(code: string): string {
    return te.has(code) ? te(code) : tt("pngError");
  }
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          const res = await fetch(`/api/export/${artifactId}`, {
            method: "POST",
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(body.error || "pngError");
          }
          const { url } = (await res.json()) as { url: string };
          window.open(url, "_blank");
          toast.success(tt("pngGenerated"));
        } catch (e) {
          toast.error(translateError((e as Error).message));
        } finally {
          setLoading(false);
        }
      }}
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <ImageDown className="size-4" />
      )}
      {t("exportPng")}
    </Button>
  );
}
