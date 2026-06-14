import "server-only";
import { chromium } from "playwright";
import { r2Configured, uploadObject } from "@/lib/r2";
import { guardPageRequests } from "@/lib/safe-render";

/**
 * Render a small PNG preview of an HTML artifact (viewport-clipped, not full
 * page) for the dashboard. Best-effort: a failure just means the list falls back
 * to a neutral placeholder, so it must never throw into the upload path.
 */
async function renderThumbnail(html: string): Promise<Buffer> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1200, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await guardPageRequests(page); // block SSRF to internal/metadata hosts
    // domcontentloaded (not networkidle) + a hard timeout keeps big/heavy
    // artifacts from hanging the thumbnail step.
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 8000 });
    return await page.screenshot({ type: "png" }); // viewport only
  } finally {
    await browser.close();
  }
}

const thumbKeyFor = (versionId: string) => `thumbs/${versionId}.png`;

/**
 * Generate + store a thumbnail and return its object key, or null if storage is
 * unconfigured or anything failed. Never throws.
 */
export async function generateThumbnail(
  versionId: string,
  html: string,
): Promise<string | null> {
  if (!r2Configured()) return null;
  try {
    const png = await renderThumbnail(html);
    const key = thumbKeyFor(versionId);
    await uploadObject(key, png, "image/png");
    return key;
  } catch {
    return null;
  }
}
