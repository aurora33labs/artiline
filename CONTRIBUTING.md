# Contributing to Artiline

Thanks for your interest in improving Artiline. This document covers how to set
up the project, the conventions we follow, and how contributions are licensed.

## Licensing of contributions

Artiline is licensed under **FSL-1.1-ALv2** (see [LICENSE](./LICENSE)). By
contributing, you agree your contribution is licensed under the same terms.

We use the **Developer Certificate of Origin (DCO)** instead of a CLA. Every
commit must be signed off, certifying you wrote the code or have the right to
submit it under the project license:

```bash
git commit -s -m "feat: your change"
```

The `-s` adds a `Signed-off-by: Your Name <you@example.com>` trailer. PRs with
unsigned commits will be asked to amend. Read the full DCO at
<https://developercertificate.org>.

## Development setup

Prerequisites: **Node 20+**, **pnpm**, **Docker** (for Postgres).

```bash
pnpm install
cp .env.example .env.local        # fill AUTH_SECRET at minimum
docker compose up -d              # Postgres 16 on :5432
pnpm db:migrate                   # apply checked-in migrations
pnpm dev                          # http://localhost:1355
```

Generate an `AUTH_SECRET` with `openssl rand -base64 32`. Without
`RESEND_API_KEY`, magic-link URLs are printed to the dev server console.

See [docs/self-hosting.md](./docs/self-hosting.md) for the full environment
matrix and [docs/architecture.md](./docs/architecture.md) for how the codebase
is organized.

## Database changes

We ship **checked-in SQL migrations** (not `db:push` against prod). After
editing `drizzle/schema.ts`:

```bash
pnpm db:generate                  # writes drizzle/migrations/XXXX_*.sql
pnpm db:migrate                   # apply locally
git add drizzle/migrations/
```

Commit the generated SQL. Do not hand-edit the migration journal.

## Open-core conventions

Paid/cloud features live in `lib/cloud/*` and `components/cloud/*` and must be
**dynamic-imported only**, behind an `isFeatureEnabled()` check. A custom
ESLint rule (`eslint-rules/no-cloud-static-import.mjs`) enforces this so the
OSS build never ships an activatable cloud feature. Core (free) features are
always enabled and never gated.

## Before you open a PR

Run the standing checks — CI runs the same:

```bash
pnpm tsc --noEmit
pnpm lint
pnpm build
```

### Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org):
`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`. Keep the subject
under ~50 characters; explain the "why" in the body when it isn't obvious.

### PR checklist

- Commits are signed off (`-s`)
- `tsc`, `lint`, and `build` pass
- Migrations generated + committed if the schema changed
- New cloud features are dynamic-imported behind a feature flag
- Docs updated if behavior or environment variables changed

## Reporting bugs and requesting features

Use the issue templates. For security vulnerabilities, **do not** open a public
issue — follow [SECURITY.md](./SECURITY.md).
