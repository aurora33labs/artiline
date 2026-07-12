# Architecture

A high-level map of how Artiline is built. For setup, see
[self-hosting.md](./self-hosting.md); for contribution conventions, see
[CONTRIBUTING.md](../CONTRIBUTING.md).

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19**, TypeScript strict
- **Drizzle ORM** + **PostgreSQL 16**, checked-in SQL migrations
- **Auth.js v5** (database session strategy) + Resend magic links
- **next-intl** (cookie-based EN/ES)
- Tailwind v4, Aurora33 theme (light/dark)

## Multi-tenancy

Tenancy is path-based: `/[workspace]/...`. A workspace is resolved from the
slug, and `requireMember()` (`lib/tenant.ts`) gates every workspace route by
checking `workspace_members`. Custom domains are mapped to a workspace by
`proxy.ts` (the Next 16 Proxy convention, formerly Middleware), which rewrites
the incoming host to the matching `/[workspace]` path (cloud feature).

## Rendering boundaries

Server Components are the default. Data is read directly from Drizzle in RSCs
and mutations run through Server Actions (`actions.ts` files colocated with
routes). Client Components are used only where interactivity requires it
(forms with optimistic UI, the theme/locale switchers, the tracking beacon).

## Open-core: editions and feature flags

One codebase serves both the free OSS edition and the hosted cloud edition. The
edition is set by `NEXT_PUBLIC_ARTILINE_EDITION` (`oss` | `cloud`).

The single choke point is **`isFeatureEnabled(feature, { workspaceId })`**
(`lib/license.ts`):

- **Core** features (`core: true` in `lib/features.ts`) are always on.
- **Paid** features resolve a tier:
  - OSS edition: from a signed `LICENSE_KEY` JWT (verified offline, ES256, in `lib/license/verify.ts`).
  - Cloud edition: from the workspace's Stripe subscription tier.
- `tierGte()` compares the resolved tier against the feature's `minTier`.

### The `lib/cloud` rule

Paid implementations live in `lib/cloud/*` and `components/cloud/*`. They are
**dynamic-imported only**, after `isFeatureEnabled()` passes:

```ts
if (await isFeatureEnabled("sso_saml", { workspaceId })) {
  const { validateResponse } = await import("@/lib/cloud/saml");
}
```

A custom ESLint rule (`eslint-rules/no-cloud-static-import.mjs`) forbids static
imports of those paths from outside the cloud folders, so the OSS bundle never
ships an activatable cloud feature. Gating is defense-in-depth: server actions
throw `FEATURE_DISABLED`, API routes 403/redirect, and gated pages `notFound()`.

Some paid features additionally depend on external services the operator
supplies: custom domains need a Cloudflare for SaaS account/token; SAML SSO
needs the customer's IdP. The code is in-process, but those integrations
require real credentials.

## Data model

Core tables (`drizzle/schema.ts`):

- **Identity / tenancy**: `users`, `workspaces`, `workspace_members`, `invitations`
- **Content + versioning**: `artifacts` (slug + `current_version_id` pointer),
  `artifact_versions` (append-only, `review_status`), `artifact_exports`
- **Social**: `comments` (per version), `reactions`
- **Tracking**: `view_events`, `tracking_salts` (daily-rotating GDPR salt)
- **Integrations**: `webhooks`, `webhook_deliveries` (HMAC + retry), `events` (activity log)
- **Auth.js**: `auth_accounts`, `auth_sessions`, `auth_verification_tokens`

Cloud-only tables: `subscriptions` (Stripe), `workspace_domains` (custom
domains), `sso_configs` (SAML/OIDC), plus `workspaces.branding` (white-label).

### Versioning model

An artifact has many `artifact_versions`; `artifacts.current_version_id` points
at the live one. Publishing creates a `pending` version; approval advances the
pointer. Rollback is append-only (clones a prior version forward), so history
and the public slug are never destroyed.

## Authentication

Auth.js with the database session strategy. Magic-link sign-in is the default.
SAML SSO (cloud) runs in-process via `@node-saml/node-saml`: dedicated routes
under `/api/sso/[workspace]/` perform the handshake, then a session row is
created directly and the Auth.js session cookie is set — no separate sidecar.
JIT provisioning adds first-time SSO users as workspace members when their
email domain is allowlisted.

## Routes overview

- `/[workspace]/...` — authenticated workspace UI (dashboard, new, settings, branding)
- `/a/[slug]` and `/a/[slug]/v/[n]` — public artifact viewer (current + pinned versions)
- `/embed/[slug]` + `/api/embed/oembed` — embeds and unfurls
- `/api/sso/[workspace]/{login,callback,metadata}` — SAML SSO
- `/api/cron/{deliver-webhooks,prune-audit}` — scheduled jobs
- `/api/auth/[...nextauth]` — Auth.js handler
- `/api/artifacts/[id]/content` — token-authenticated content read (`Bearer artl_...`),
  for integrations without a session (e.g. webhook-driven ingesters); optional
  `?v=<versionNumber>` reads a pinned version instead of the current one

### Webhooks

`webhooks` + `webhook_deliveries` (HMAC-signed, cron-delivered, retried on
non-2xx). Events: `artifact.created`, `version.published`, `version.proposed`,
`version.approved`, `version.changes_requested`, `version.rolled_back`,
`comment.created`, `artifact.viewed`, `artifact.deleted` (`lib/webhooks/emit.ts`).
Signature: header `t=<unix-seconds>,v1=<hex>`, HMAC-SHA256 of `${t}.${rawBody}`
with the webhook's secret (`lib/webhooks/sign.ts`) — receivers must recompute
over that exact string, not the raw body alone.

`artifact.created` and `version.published` payloads carry `workspaceSlug`,
`slug`, `type`, and `versionNumber` — enough for a receiver to resolve the
workspace and pick a content converter, then fetch the actual bytes via
`GET /api/artifacts/[id]/content` (content itself never rides in the payload;
artifacts run up to `MAX_CONTENT_BYTES`).
