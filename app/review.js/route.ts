import { externalReviewsEnabled } from "@/lib/external-reviews";
import { REVIEW_WIDGET_SOURCE } from "@/lib/review-widget/source";

export const runtime = "nodejs";

/**
 * Serves the External Reviews widget as a plain script — installed by pasting
 * `<script src="https://<host>/review.js" data-key="arev_..." defer></script>`
 * into a site Artiline doesn't host. No CORS headers needed here: a `<script
 * src>` load isn't subject to CORS: the widget's own fetch() calls to
 * /api/review/* are what get checked against the registered Origin.
 *
 * Serving 404 while the feature is off also unmounts the widget from any site
 * that still has the snippet pasted in — the script never loads, so no floating
 * button is injected and nothing calls the (also disabled) API.
 */
export async function GET() {
  if (!externalReviewsEnabled()) return new Response("Not found", { status: 404 });
  return new Response(REVIEW_WIDGET_SOURCE, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
