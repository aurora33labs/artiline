"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useAnnotationsOptional } from "@/components/annotation-provider";

export function HtmlViewer({
  src,
  fullscreen,
}: {
  src: string;
  fullscreen?: boolean;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const [iframeReady, setIframeReady] = useState(false);
  const ctx = useAnnotationsOptional();

  // Height reporting + element message handling
  useEffect(() => {
    if (fullscreen) return;
    const handler = (e: MessageEvent) => {
      if (!e.data || typeof e.data !== "object") return;
      if (e.data.type === "IFRAME_HEIGHT" && typeof e.data.height === "number") {
        setContentHeight(e.data.height);
      }
      if (!ctx) return;
      if (e.data.type === "ELEMENT_SELECTED") {
        ctx.setPendingElementDraft({ xpath: e.data.xpath, rect: e.data.rect });
        ctx.setIsInspecting(false);
      }
      if (e.data.type === "ELEMENT_POSITIONS" && Array.isArray(e.data.positions)) {
        ctx.setElementRects((prev) => {
          const next = { ...prev };
          for (const pos of e.data.positions) {
            next[pos.commentId] = pos.rect;
          }
          return next;
        });
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [fullscreen, ctx]);

  // Memoize element xpath list to avoid unnecessary sends
  const watchedXPaths = useMemo(() =>
    (ctx?.annotations ?? [])
      .filter((a) => a.targetType === "element" && a.anchorXPath && !a.resolved)
      .map((a) => ({ commentId: a.commentId, xpath: a.anchorXPath! })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx?.annotations]
  );

  // Send WATCH_XPATHS after iframe loads or when element annotations change
  useEffect(() => {
    if (!iframeReady || fullscreen || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage({ type: "WATCH_XPATHS", xpaths: watchedXPaths }, "*");
  }, [iframeReady, watchedXPaths, fullscreen]);

  // Send INSPECT_MODE when inspect state changes
  useEffect(() => {
    if (!iframeReady || fullscreen || !ctx || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage({ type: "INSPECT_MODE", active: ctx.isInspecting }, "*");
  }, [iframeReady, ctx?.isInspecting, fullscreen]);  // eslint-disable-line react-hooks/exhaustive-deps

  if (fullscreen) {
    return (
      <iframe
        src={src}
        sandbox="allow-scripts"
        className="w-screen h-screen border-0 bg-white"
        title="artifact-html"
      />
    );
  }

  return (
    <iframe
      ref={iframeRef}
      src={src}
      sandbox="allow-scripts"
      className="w-full border-0 bg-white block"
      style={{ height: contentHeight ? `${contentHeight}px` : undefined, minHeight: "100vh" }}
      title="artifact-html"
      onLoad={() => setIframeReady(true)}
    />
  );
}
