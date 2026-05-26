import { chromium } from "playwright";

export async function htmlToPng(
  html: string,
  opts: { width?: number; height?: number; deviceScaleFactor?: number } = {},
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
    await page.setContent(html, { waitUntil: "networkidle" });
    const buffer = await page.screenshot({ type: "png", fullPage: true });
    return buffer;
  } finally {
    await browser.close();
  }
}
