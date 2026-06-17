import "server-only";
import type { Page } from "playwright";

// A non-resolvable sentinel origin. The navigation request is fulfilled in-memory
// (never hits the network/DNS), giving the document a normal http(s) origin.
const SENTINEL = "https://artifact.local/index.html";

/**
 * Loads a full HTML document into a headless page via a real navigation instead
 * of `page.setContent()`.
 *
 * Why: `setContent` injects the markup with `document.write`, and Chrome's
 * "intervention" can block parser-blocking cross-origin `<script>` tags loaded
 * that way (e.g. the Babel CDN the React wrapper depends on) under less-than-
 * ideal network conditions. When that happens the artifact never transpiles and
 * the screenshot comes out blank — the failure we saw for React thumbnails on
 * the server. A route-fulfilled navigation has a real origin and loads those
 * scripts reliably.
 *
 * Register order matters: call this AFTER `guardPageRequests(page)` so the exact
 * sentinel route wins for the top document while every sub-resource (esm.sh,
 * fonts, etc.) still flows through the SSRF guard.
 */
export async function gotoDocument(
  page: Page,
  html: string,
  opts: {
    waitUntil?: "domcontentloaded" | "load" | "networkidle";
    timeout?: number;
  } = {},
): Promise<void> {
  await page.route(SENTINEL, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: html,
    }),
  );
  await page.goto(SENTINEL, {
    waitUntil: opts.waitUntil ?? "domcontentloaded",
    timeout: opts.timeout ?? 15000,
  });
}
