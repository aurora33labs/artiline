"use client";

import { useEffect, useRef } from "react";

/**
 * Client-side beacon that reports dwell time and scroll depth to /api/track.
 * Runs only when mounted (caller decides whether to render based on
 * tracking_advanced feature flag).
 *
 * Single beacon at unload; uses navigator.sendBeacon for reliability.
 */
export function TrackingBeacon({
  artifactId,
  versionId,
}: {
  artifactId: string;
  versionId: string;
}) {
  const startRef = useRef<number>(0);
  const scrollRef = useRef<number>(0);
  const sessionRef = useRef<string>("");

  useEffect(() => {
    startRef.current = Date.now();
    sessionRef.current =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);

    function track() {
      const root = document.scrollingElement ?? document.documentElement;
      const max = Math.max(root.scrollHeight - window.innerHeight, 1);
      const pct = Math.min(100, Math.round((window.scrollY / max) * 100));
      if (pct > scrollRef.current) scrollRef.current = pct;
    }

    function send() {
      const dwellMs = Date.now() - startRef.current;
      const body = JSON.stringify({
        artifactId,
        versionId,
        sessionId: sessionRef.current,
        dwellMs,
        scrollDepth: scrollRef.current,
      });
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
      } else {
        fetch("/api/track", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {});
      }
    }

    window.addEventListener("scroll", track, { passive: true });
    window.addEventListener("pagehide", send);

    return () => {
      window.removeEventListener("scroll", track);
      window.removeEventListener("pagehide", send);
      send();
    };
  }, [artifactId, versionId]);

  return null;
}
