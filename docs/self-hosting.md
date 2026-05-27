# Self-hosting Artiline

Artiline runs as a standard Next.js app plus a PostgreSQL database. Self-hosting
the OSS edition is free and unlocks every **core** feature. Paid features are
activated with a `LICENSE_KEY` (see [Activating paid features](#activating-paid-features)).

## Requirements

- **Node 20+** and **pnpm** (or a container runtime to build the included `Dockerfile`)
- **PostgreSQL 16**
- An SMTP/email provider for magic links (we use [Resend](https://resend.com))
- Optional: Cloudflare R2 (or any S3-compatible bucket) for PNG export storage

## Quick start (local / Docker Postgres)

```bash
git clone <your-fork-or-release>
cd artiline
pnpm install

cp .env.example .env.local
# set AUTH_SECRET (openssl rand -base64 32) and AUTH_URL

docker compose up -d          # Postgres 16 on :5432
pnpm db:migrate               # apply checked-in migrations
pnpm build && pnpm start      # production
# or: pnpm dev                # http://localhost:1355
```

Without `RESEND_API_KEY`, magic-link URLs are logged to the server console, so
you can sign in locally without configuring email.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `AUTH_SECRET` | yes | Session encryption. `openssl rand -base64 32` |
| `AUTH_URL` | yes | Public base URL (e.g. `https://artiline.example.com`) |
| `AUTH_TRUST_HOST` | prod behind proxy | Set `true` when running behind a reverse proxy |
| `RESEND_API_KEY` | yes (prod) | Magic-link + invitation delivery. Omit in dev to log links |
| `RESEND_FROM` | yes (prod) | From-address for emails |
| `R2_ACCOUNT_ID` | optional | Cloudflare R2 account; without R2, PNG export is disabled |
| `R2_ACCESS_KEY_ID` | optional | R2 access key |
| `R2_SECRET_ACCESS_KEY` | optional | R2 secret key |
| `R2_BUCKET` | optional | Export bucket name |
| `R2_PUBLIC_URL` | optional | Public base URL for exported assets |
| `NEXT_PUBLIC_ARTILINE_EDITION` | no | `oss` (default) or `cloud` |
| `LICENSE_KEY` | no | Activates paid features by tier (OSS edition) |
| `LICENSE_DEV_BYPASS` | no | **Local dev only.** Ignored when `NODE_ENV=production` |
| `ARTILINE_ENABLE_CUSTOM_DOMAIN` | no | Per-feature env override |
| `CRON_SECRET` | prod | Bearer token guarding `/api/cron/*` endpoints |

Generate `AUTH_SECRET`:

```bash
openssl rand -base64 32
```

## Database migrations

Migrations are checked-in SQL under `drizzle/migrations/`. Apply them on every
deploy after pulling new code:

```bash
pnpm db:migrate
```

`db:push` exists for fast local iteration only — never run it against
production.

## Background jobs (cron)

Two endpoints expect to be invoked on a schedule (Vercel Cron, a system
cron + `curl`, or a container sidecar). Guard them with `CRON_SECRET`:

```bash
curl -X POST https://your-host/api/cron/deliver-webhooks \
  -H "Authorization: Bearer $CRON_SECRET"
curl -X POST https://your-host/api/cron/prune-audit \
  -H "Authorization: Bearer $CRON_SECRET"
```

- `deliver-webhooks` — retries pending webhook deliveries (exponential backoff)
- `prune-audit` — deletes activity events past the retention horizon

## Email provider

Artiline ships with Resend. To use a different provider, replace the
`sendVerificationRequest` implementation in `auth.ts`. Any SMTP transport works;
the only requirement is delivering the magic-link URL to the recipient.

## Activating paid features

The OSS build is the same binary as the hosted edition. Paid features stay
gated until you provide a valid `LICENSE_KEY` (a signed JWT issued by the
Artiline cloud). Set it and restart:

```bash
LICENSE_KEY=<your-jwt>
```

The key encodes a tier (`studio`, `agency`, `agency_plus`); features unlock
according to that tier. No phone-home: license verification is offline (ES256
signature check), so airgapped deployments work.

> Contributors working locally can enable an unsigned dev token via
> `LICENSE_DEV_BYPASS` to exercise paid features without a real key. It is a
> development-only convenience and is ignored when `NODE_ENV=production`, so it
> has no effect on a deployed instance. See CONTRIBUTING for details.

> Note: some paid features additionally depend on external services you must
> provide yourself (e.g. custom domains require a Cloudflare for SaaS account).
> See [docs/architecture.md](./architecture.md).

## Production checklist

- Strong, unique `AUTH_SECRET`
- `AUTH_URL` set to the real HTTPS origin; `AUTH_TRUST_HOST=true` behind a proxy
- PostgreSQL not exposed to the public internet
- HTTPS terminated in front of the app
- `CRON_SECRET` set and cron endpoints scheduled
- `pnpm db:migrate` run on deploy
