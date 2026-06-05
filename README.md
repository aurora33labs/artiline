# Artiline

[![CI](https://github.com/aurora33labs/artiline/actions/workflows/ci.yml/badge.svg)](https://github.com/aurora33labs/artiline/actions/workflows/ci.yml)
[![License: FSL-1.1-ALv2](https://img.shields.io/badge/license-FSL--1.1--ALv2-blue.svg)](./LICENSE)

Open-core SaaS for creative agencies to deliver AI artifacts to clients — with
versioning, persistent URLs, password gating, tracking, and white-label.

Developed by [aurora33.org](https://aurora33.org).

## Stack

- Next.js 16 (App Router, Server Actions, RSC)
- React 19, strict TypeScript
- Tailwind CSS v4 + shadcn/ui (Radix)
- PostgreSQL 16 + Drizzle ORM
- Auth.js v5 (magic link via Resend)
- Cloudflare R2 (S3 SDK) for PNG exports
- Playwright (headless chromium) for HTML→PNG
- next-intl EN/ES, Aurora33 light/dark theme

## MVP features (core, OSS)

- Multi-tenant workspaces (path-based `/[workspace]/...`)
- 4 visibility levels per artifact: `internal`, `internal_pw`, `public`, `public_pw`
- Create/list/view artifacts (HTML, Markdown, code with syntax highlighting)
- Email invitations (magic link)
- Comments + emoji reactions
- HTML → PNG export (marketing format)
- View counter, TTL expiration
- i18n EN/ES, light/dark theme

## Edition model

| Feature set | OSS (self-host) | Hosted Studio | Hosted Agency | Hosted Agency+ |
|---|---|---|---|---|
| Core features above | ✓ | ✓ | ✓ | ✓ |
| Versioning + persistent URL | ✓ | ✓ | ✓ | ✓ |
| Review mode | ✓ | ✓ | ✓ | ✓ |
| Basic tracking | ✓ | ✓ | ✓ | ✓ |
| Basic webhooks | ✓ | ✓ | ✓ | ✓ |
| oEmbed embeds | ✓ | ✓ | ✓ | ✓ |
| Activity log | ✓ | ✓ | ✓ | ✓ |
| Search (Postgres FTS) | ✓ | ✓ | ✓ | ✓ |
| Custom domain + white-label | — | — | ✓ | ✓ |
| Advanced tracking (geo/dwell) | — | — | ✓ | ✓ |
| Branded export | — | — | ✓ | ✓ |
| Slack/Linear apps | — | — | ✓ | ✓ |
| SSO/SAML | — | — | — | ✓ |
| Extended audit retention | — | — | — | ✓ |
| Automatic backups | — | — | — | ✓ |
| Priority support + SLA | — | — | — | ✓ |

A paid `LICENSE_KEY` on a self-hosted instance unlocks features by tier.

## Local setup (Docker + dev server)

```bash
# 1. Postgres
docker compose up -d

# 2. Environment
cp .env.example .env.local
# edit: AUTH_SECRET = `openssl rand -base64 32`
# optional: RESEND_API_KEY (without it, magic links are logged to stdout)
# optional: R2_* (without it, PNG export returns 503)

# 3. Schema → DB
pnpm db:push     # fast dev
# or:
pnpm db:migrate  # production / self-host

# 4. Dev server
pnpm dev
```

Open http://localhost:1355.

## Commands

```
pnpm dev              # dev server (port 1355)
pnpm build            # production build
pnpm start            # production start
pnpm lint             # eslint + custom no-cloud-static-import rule
pnpm db:generate      # generate checked-in SQL migration
pnpm db:migrate       # apply migrations (self-host + prod)
pnpm db:push          # push schema directly (dev only)
pnpm db:studio        # Drizzle Studio GUI
```

## License

Artiline ships under **FSL-1.1-ALv2** (Functional Source License v1.1, Apache 2.0
future license). Self-hosting is free. No third-party commercial hosting of
Artiline for 2 years; after that each release converts to Apache 2.0. See
[LICENSE](./LICENSE) and [LICENSE-APACHE-2.0](./LICENSE-APACHE-2.0).

## Hosted SaaS

Coming soon at **artiline.app** — Studio $29/mo, Agency $149/mo, Agency+ $499/mo.

## Docs

- [Self-hosting](./docs/self-hosting.md)
- [Architecture](./docs/architecture.md)
- [Contributing](./CONTRIBUTING.md)
- [Security](./SECURITY.md)
</content>
</invoke>
