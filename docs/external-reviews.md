# External Reviews

Review a site Artiline doesn't host — too heavy a stack to upload as an
artifact, already deployed elsewhere — using the same comments/annotations
system as any artifact.

## How it works

1. In a workspace, go to **New → Add an external site**, give it a name and
   the site's URL. Artiline creates an artifact of type `external` (visibility
   `internal`) plus a public widget key (`arev_...`) scoped to that site's
   origin.
2. Paste the installed snippet before `</body>` on every page you want
   reviewable:

   ```html
   <script src="https://<your-artiline-host>/review.js" data-key="arev_..." defer></script>
   ```

3. Visiting the site shows a floating button (bottom-right). Clicking it
   enters annotate mode — click an element to leave a comment anchored to it,
   or leave a general page comment. Comments show up on the artifact's page in
   Artiline, grouped by the page path they were left on.

## What the public key can and can't do

The key is meant to be public — it ships in the client's HTML, so anyone
viewing page source can see it. It is scoped narrowly:

- **Can**: create comments/annotations on its own site (rate-limited), report
  a page's content hash, read annotation *positions* (pins) for a page.
- **Cannot**: read comment bodies (only readable from inside Artiline with a
  session — otherwise anyone holding the key could read the team's internal
  discussion), touch any other artifact, modify or delete anything.

Rotate the key (invalidates the old one immediately) or disable the site
entirely from the artifact's page in Artiline if a key needs to be revoked.

## Change tracking

The widget reports a hash of the page's visible text on load. If it differs
from the last known hash for that page, Artiline marks existing annotations on
that page as "possibly outdated" (shown with a CHANGED badge) and logs an
activity event — no polling infrastructure, no cron. To avoid noisy false
positives on highly dynamic pages, a page is only re-flagged at most once per
hour.

This is a heuristic, not a diff: a page with dynamic content (timestamps,
randomized ordering, A/B tests) may occasionally flag as "changed" without a
meaningful edit. There is no visual diff of the external site's HTML — the
snippet only sees what's rendered in the visitor's browser.

## Requirements on the client's site

- **CSP**: if the site sets a Content-Security-Policy, `script-src` must allow
  the Artiline host (for `/review.js`) and `connect-src` must allow it too
  (for the widget's `fetch()` calls to `/api/review/*`). If the CSP blocks it,
  the widget simply never loads — it fails silently and never breaks the host
  page.
- **Single origin**: the registered origin (scheme + host + port) must match
  exactly what the browser sends as `Origin` on every request. `https://www.example.com`
  and `https://example.com` are different origins — register the one the
  snippet is actually served from.
- **No Subresource Integrity on the snippet tag on purpose**: `/review.js` is
  served by your own Artiline instance (not a third-party CDN) and changes on
  every deploy, so pinning a SHA-384 hash would break on the next release.
  Same trade-off as Intercom/Marker.io-style first-party widgets.

## Not yet built (roadmap)

- Magic-link / authenticated comments from the external site (today: anonymous
  + a display name, same as public artifact comments).
- Screenshots of the reviewed page alongside the comment.
- Per-workspace allowlist of embeddable origins for the artifact embed feature
  (unrelated to this feature, but adjacent).
