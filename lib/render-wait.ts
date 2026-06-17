import "server-only";
import type { Page } from "playwright";

/**
 * Waits for a React artifact wrapper (lib/react-wrapper.ts) to finish booting in
 * a headless page: either the component mounted (`#root` has children) or the
 * bootstrap painted an error (`#__err`). Used by the thumbnail generator and the
 * PNG export so neither screenshots a blank page before esm.sh + Babel + mount
 * complete. Returns `"error"` when the wrapper rendered an error pane so callers
 * can avoid storing a screenshot of the error text.
 */
export async function waitForReactMount(
  page: Page,
  timeout = 15000,
): Promise<"ok" | "error"> {
  await page.waitForFunction(
    () =>
      !!document.getElementById("__err") ||
      (document.getElementById("root")?.childElementCount ?? 0) > 0,
    { timeout },
  );
  return (await page.$("#__err")) ? "error" : "ok";
}
