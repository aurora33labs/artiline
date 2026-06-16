"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * Renders a JSX/TSX artifact. "Preview" runs the live component in the same
 * sandboxed iframe HTML artifacts use (src points at /api/artifacts/raw, which
 * serves the React wrapper document). "Source" shows the Shiki-highlighted code,
 * rendered server-side and passed in as `sourceSlot`, so nothing is lost vs the
 * old code view.
 */
export function ReactViewer({
  src,
  sourceSlot,
  fullscreen,
}: {
  src: string;
  sourceSlot: React.ReactNode;
  fullscreen?: boolean;
}) {
  const t = useTranslations("viewer");
  const [view, setView] = useState<"preview" | "source">("preview");

  const tab = (key: "preview" | "source") =>
    cn(
      "px-2.5 py-1 text-[11px] font-display font-medium uppercase tracking-[0.06em] rounded-xs transition-colors",
      view === key
        ? "bg-surface text-foreground ring-1 ring-border"
        : "text-muted-foreground hover:text-foreground",
    );

  return (
    <div className={cn(fullscreen ? "w-screen h-screen" : "w-full")}>
      <div
        className={cn(
          "absolute z-10 inline-flex gap-0.5 rounded-sm bg-surface-2 p-0.5 ring-1 ring-border",
          fullscreen ? "top-4 left-1/2 -translate-x-1/2" : "right-2 top-2",
        )}
      >
        <button type="button" className={tab("preview")} onClick={() => setView("preview")}>
          {t("preview")}
        </button>
        <button type="button" className={tab("source")} onClick={() => setView("source")}>
          {t("source")}
        </button>
      </div>

      {view === "preview" ? (
        <iframe
          src={src}
          sandbox="allow-scripts"
          className={cn(
            "bg-white",
            fullscreen
              ? "w-screen h-screen border-0"
              : "w-full h-[70vh] border rounded-md",
          )}
          title="artifact-react"
        />
      ) : (
        <div className={cn(fullscreen ? "h-screen overflow-auto" : undefined)}>
          {sourceSlot}
        </div>
      )}
    </div>
  );
}
