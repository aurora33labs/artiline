import "server-only";
import { chromium } from "playwright";
import { r2Configured, uploadObject } from "@/lib/r2";
import { guardPageRequests } from "@/lib/safe-render";
import { gotoDocument } from "@/lib/headless-doc";
import { renderReactWrapper } from "@/lib/react-wrapper";
import { waitForReactMount } from "@/lib/render-wait";

/**
 * Render a small PNG preview of an artifact (viewport-clipped, not full page) for
 * the dashboard. Best-effort: a failure just means the list falls back to a
 * neutral placeholder, so it must never throw into the upload path.
 *
 * `reactMount` waits for the React wrapper to mount (esm.sh + Babel + render)
 * before the screenshot, and throws if the wrapper painted an error pane so we
 * never store a picture of an error message.
 */
async function renderThumbnail(
  html: string,
  opts: { reactMount?: boolean } = {},
): Promise<Buffer> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1200, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await guardPageRequests(page); // block SSRF to internal/metadata hosts
    // Navigate (not setContent) so cross-origin CDN scripts the artifact pulls
    // load reliably; domcontentloaded + a hard timeout keeps big/heavy artifacts
    // from hanging the thumbnail step.
    await gotoDocument(page, html, {
      waitUntil: "domcontentloaded",
      timeout: 8000,
    });
    if (opts.reactMount) {
      const status = await waitForReactMount(page);
      if (status === "error") throw new Error("react-render-failed");
      await page.waitForTimeout(600); // settle fonts/charts before capture
    }
    return await page.screenshot({ type: "png" }); // viewport only
  } finally {
    await browser.close();
  }
}

const thumbKeyFor = (versionId: string) => `thumbs/${versionId}.png`;

/**
 * Generate + store a thumbnail and return its object key, or null if storage is
 * unconfigured or anything failed. Never throws.
 *
 * For React artifacts (`opts.react`), `content` is the raw JSX/TSX source — it is
 * wrapped via `renderReactWrapper` and screenshotted as a live component, exactly
 * the document the viewer iframe renders.
 */
export async function generateThumbnail(
  versionId: string,
  content: string,
  opts: { react?: boolean } = {},
): Promise<string | null> {
  if (!r2Configured()) return null;
  try {
    const html = opts.react ? renderReactWrapper(content) : content;
    const png = await renderThumbnail(html, { reactMount: opts.react });
    const key = thumbKeyFor(versionId);
    await uploadObject(key, png, "image/png");
    return key;
  } catch {
    return null;
  }
}
