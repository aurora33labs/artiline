import { chromium } from "playwright";
import { guardPageRequests } from "@/lib/safe-render";
import { gotoDocument } from "@/lib/headless-doc";
import { waitForReactMount } from "@/lib/render-wait";

export async function htmlToPng(
  html: string,
  opts: {
    width?: number;
    height?: number;
    deviceScaleFactor?: number;
    // For React wrapper docs: wait until the component mounts before capturing,
    // and throw ERR_EXPORT_RENDER_FAILED if the wrapper painted an error pane.
    waitForMount?: boolean;
  } = {},
): Promise<Buffer> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: {
        width: opts.width ?? 1200,
        height: opts.height ?? 630,
      },
      deviceScaleFactor: opts.deviceScaleFactor ?? 2,
    });
    const page = await context.newPage();
    await guardPageRequests(page); // block SSRF to internal/metadata hosts
    if (opts.waitForMount) {
      await gotoDocument(page, html, { waitUntil: "domcontentloaded" });
      const status = await waitForReactMount(page);
      if (status === "error") throw new Error("ERR_EXPORT_RENDER_FAILED");
      await page.waitForTimeout(600); // settle fonts/charts before capture
    } else {
      await gotoDocument(page, html, { waitUntil: "networkidle" });
    }
    const buffer = await page.screenshot({ type: "png", fullPage: true });
    return buffer;
  } finally {
    await browser.close();
  }
}
