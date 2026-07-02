"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Tabs, TabsList, TabsContent, TabsTrigger } from "@/components/ui/tabs";

type Os = "mac" | "win";

/** Rich-text handlers shared by every step string (bold labels + inline code). */
const rich = {
  b: (chunks: React.ReactNode) => <strong className="text-foreground">{chunks}</strong>,
  code: (chunks: React.ReactNode) => (
    <code className="font-mono text-[0.85em]">{chunks}</code>
  ),
};

/**
 * Step 3 of the connect flow: how to install the .mcpb in Claude Desktop, which
 * differs by OS. On Windows double-clicking the file does nothing (the shell has
 * no `.mcpb` association) — it must be installed from Settings → Extensions, so
 * that path gets an explicit warning. `defaultOs` is sniffed server-side from the
 * user-agent to preselect the tab; the user can still switch.
 */
export function McpInstallSteps({
  defaultOs = "mac",
  images,
}: {
  defaultOs?: Os;
  images?: { mac?: string; win?: string };
}) {
  const t = useTranslations("mcp");
  const [os, setOs] = useState<Os>(defaultOs);

  return (
    <Tabs value={os} onValueChange={(v) => setOs(v as Os)}>
      <TabsList>
        <TabsTrigger value="mac">{t("osMac")}</TabsTrigger>
        <TabsTrigger value="win">{t("osWin")}</TabsTrigger>
      </TabsList>

      <TabsContent value="mac" className="space-y-3 pt-1">
        <ol className="text-sm text-muted-foreground list-decimal pl-5 space-y-1.5">
          <li>{t.rich("macStep1", rich)}</li>
          <li>{t.rich("macStep2", rich)}</li>
          <li>{t.rich("macStep3", rich)}</li>
        </ol>
        {images?.mac && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={images.mac}
            alt=""
            className="rounded-md border border-border w-full"
          />
        )}
      </TabsContent>

      <TabsContent value="win" className="space-y-3 pt-1">
        <div className="flex items-start gap-2 border border-warning/60 bg-warning/5 px-3 py-2 text-warning text-sm">
          <AlertTriangle className="size-4 mt-0.5 shrink-0" />
          <span>{t.rich("winWarning", rich)}</span>
        </div>
        <ol className="text-sm text-muted-foreground list-decimal pl-5 space-y-1.5">
          <li>{t.rich("winStep1", rich)}</li>
          <li>{t.rich("winStep2", rich)}</li>
          <li>{t.rich("winStep3", rich)}</li>
        </ol>
        {images?.win && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={images.win}
            alt=""
            className="rounded-md border border-border w-full"
          />
        )}
      </TabsContent>
    </Tabs>
  );
}
