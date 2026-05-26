# Artiline

Open-core SaaS para que agencias creativas entreguen AI artifacts a clientes — con versionado, URL persistente, password gating, tracking y white-label.

## Stack

- Next.js 16 (App Router, Server Actions, RSC)
- React 19, TypeScript estricto
- Tailwind CSS v4 + shadcn/ui (Radix)
- PostgreSQL 16 + Drizzle ORM
- Auth.js v5 (magic link via Resend)
- Cloudflare R2 (S3 SDK) para exports PNG
- Playwright (chromium headless) para HTML→PNG
- next-intl EN/ES, theme Aurora33 light/dark

## Features MVP (core, OSS)

- Workspaces multi-tenant (path-based `/[workspace]/...`)
- 4 niveles de visibilidad por artifact: `internal`, `internal_pw`, `public`, `public_pw`
- Crear/listar/ver artifacts (HTML, Markdown, código con highlight)
- Invitaciones por email (magic link)
- Comentarios + reacciones emoji
- Export HTML → PNG (formato marketing)
- Contador de vistas, expiración TTL
- i18n EN/ES, theme light/dark

## Edition model

| Feature set | OSS (self-host) | Hosted Studio | Hosted Agency | Hosted Agency+ |
|---|---|---|---|---|
| Core features arriba | ✓ | ✓ | ✓ | ✓ |
| Versioning + URL persistente | ✓ | ✓ | ✓ | ✓ |
| Review mode | ✓ | ✓ | ✓ | ✓ |
| Tracking básico | ✓ | ✓ | ✓ | ✓ |
| Webhooks básico | ✓ | ✓ | ✓ | ✓ |
| Embed oEmbed | ✓ | ✓ | ✓ | ✓ |
| Activity log | ✓ | ✓ | ✓ | ✓ |
| Search (Postgres FTS) | ✓ | ✓ | ✓ | ✓ |
| Custom domain + white-label | — | — | ✓ | ✓ |
| Tracking avanzado (geo/dwell) | — | — | ✓ | ✓ |
| Branded export | — | — | ✓ | ✓ |
| Slack/Linear apps | — | — | ✓ | ✓ |
| SSO/SAML | — | — | — | ✓ |
| Audit retention extendido | — | — | — | ✓ |
| Automatic backups | — | — | — | ✓ |
| Priority support + SLA | — | — | — | ✓ |

Self-host con `LICENSE_KEY` paid desbloquea features según tier.

## Setup local (Docker + dev server)

```bash
# 1. Postgres
docker compose up -d

# 2. Variables
cp .env.example .env.local
# editar: AUTH_SECRET = `openssl rand -base64 32`
# opcional: RESEND_API_KEY (sin esto magic links se loguean a stdout)
# opcional: R2_* (sin esto export PNG retorna 503)

# 3. Schema → DB
pnpm db:push     # dev rápido
# o bien:
pnpm db:migrate  # producción / self-host

# 4. Dev server
pnpm dev
```

Abre http://localhost:1355.

## Comandos

```
pnpm dev              # dev server (port 1355)
pnpm build            # build producción
pnpm start            # start producción
pnpm lint             # eslint + custom no-cloud-static-import rule
pnpm db:generate      # generar migración SQL checked-in
pnpm db:migrate       # aplicar migraciones (self-host + prod)
pnpm db:push          # push schema directo (solo dev)
pnpm db:studio        # GUI Drizzle Studio
```

## License

Artiline ships under **FSL-1.1-ALv2** (Functional Source License v1.1, Apache 2.0 future license). Self-host gratis. No comercial hosting de Artiline por terceros durante 2 años; después convierte a Apache 2.0. Ver [LICENSE](./LICENSE) y [LICENSE-APACHE-2.0](./LICENSE-APACHE-2.0).

## Hosted SaaS

Pronto en **artiline.app** — Studio $29/mo, Agency $149/mo, Agency+ $499/mo.

## Docs

- [Self-hosting](./docs/self-hosting.md)
- [Architecture](./docs/architecture.md)
- [Contributing](./CONTRIBUTING.md)
- [Security](./SECURITY.md)
