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
  // When the artifact sizes itself with viewport units (100vh/svh/dvh), the
  // seamless auto-height loop runs away: each height we apply enlarges the
  // iframe's own viewport, which re-inflates those units, which reports a taller
  // height, and so on — leaving a giant blank page with a spurious scrollbar.
  // We detect that feedback (content that keeps growing *after* we already sized
  // the iframe to it) and switch to a fixed viewport height with internal scroll,
  // exactly like the fullscreen branch, which renders such artifacts correctly.
  const [scrollMode, setScrollMode] = useState(false);
  const scrollModeRef = useRef(false);
  const appliedHeightRef = useRef(0);
  // Viewport-unit runaway grows on *consecutive* apply cycles (each applied
  // height re-inflates the vh sections); a static page that just loads late
  // grows at most once and stabilizes. Require two consecutive runaway jumps
  // before switching so tall-but-static pages keep the auto-height path.
  const runawayHitsRef = useRef(0);
  const ctx = useAnnotationsOptional();

  // Height reporting + element message handling
  useEffect(() => {
    if (fullscreen) return;
    const handler = (e: MessageEvent) => {
      if (!e.data || typeof e.data !== "object") return;
      if (e.data.type === "IFRAME_HEIGHT" && typeof e.data.height === "number") {
        if (scrollModeRef.current) return; // frozen once we detect viewport-unit runaway
        const h = e.data.height as number;
        // A large jump *after* we already sized the iframe to its reported height
        // may be viewport-unit feedback (applying the height enlarged the iframe's
        // viewport, re-inflating vh/svh sections) OR just a static page finishing
        // an async load. The two look identical on the first jump, but only the
        // runaway keeps growing on the *next* apply cycle — so we apply the height
        // and require a second consecutive runaway jump before switching modes.
        if (appliedHeightRef.current > 0 && h > appliedHeightRef.current * 1.5) {
          runawayHitsRef.current += 1;
          if (runawayHitsRef.current >= 2) {
            scrollModeRef.current = true;
            setScrollMode(true);
            ctx?.setHtmlScrollMode(true);
            return;
          }
        } else {
          runawayHitsRef.current = 0; // stabilized — not a runaway
        }
        appliedHeightRef.current = h;
        setContentHeight(h);
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

  // Viewport-unit artifact: pin the iframe to the visible viewport and let it
  // scroll internally so vh/svh/dvh resolve against a stable height.
  if (scrollMode) {
    return (
      <iframe
        ref={iframeRef}
        src={src}
        sandbox="allow-scripts"
        className="w-full border-0 bg-white block"
        style={{ height: "100dvh" }}
        title="artifact-html"
        onLoad={() => setIframeReady(true)}
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
