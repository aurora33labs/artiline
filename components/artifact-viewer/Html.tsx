"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export function HtmlViewer({
  src,
  fullscreen,
}: {
  src: string;
  fullscreen?: boolean;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    if (fullscreen) return;
    const handler = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (e.data?.type === "IFRAME_HEIGHT" && typeof e.data.height === "number") {
        setContentHeight(e.data.height);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [fullscreen]);

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
      className={cn("w-full border-0 bg-white block", !contentHeight && "min-h-[70vh]")}
      style={contentHeight ? { height: `${contentHeight}px` } : { minHeight: "70vh" }}
      title="artifact-html"
    />
  );
}
