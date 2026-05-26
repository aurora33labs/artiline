# lib/cloud — paid feature implementations

Code here is **only loaded via dynamic `import()` after `isFeatureEnabled()` check**. Never import statically from outside this folder.

ESLint rule `no-cloud-static-import` enforces this. CI grep guard backs it up.

## Files

- `billing.ts` — Stripe subscriptions, tier resolution
- `custom-domain.ts` — Cloudflare for SaaS DNS provisioning
- `sso.ts` — SAML/OIDC providers
- `tracking-advanced.ts` — geo, dwell, scroll depth
- `audit-retention.ts` — extended retention policies

## License

Cloud impls follow the same FSL-1.1-Apache-2.0 license as the root. They are guarded at runtime so OSS deployments cannot legally activate them without a paid `LICENSE_KEY`.
