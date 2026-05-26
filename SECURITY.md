# Security Policy

## Supported versions

Artiline is pre-1.0. Security fixes land on the latest `main` and the most
recent tagged release. Older releases are not patched.

## Reporting a vulnerability

**Do not open a public issue for security problems.**

Email **hola@aurora33.org** with:

- A description of the vulnerability and its impact
- Steps to reproduce (proof-of-concept if possible)
- Affected version / commit
- Any suggested remediation

You will receive an acknowledgement within **72 hours**. We aim to provide an
assessment and remediation plan within **7 days**.

## Disclosure process

We follow coordinated disclosure with a **90-day embargo**:

1. You report privately.
2. We confirm, develop a fix, and prepare an advisory.
3. We release the fix and publish a GitHub Security Advisory, crediting you
   (unless you prefer to stay anonymous).
4. Public disclosure happens after the fix ships, or at 90 days, whichever
   comes first.

If a vulnerability is being actively exploited, we may shorten the timeline.

## Scope

In scope:

- The Artiline application code in this repository
- Authentication, session handling, multi-tenant access control, the feature
  license gate, and the SAML/SSO flow

Out of scope:

- Vulnerabilities in third-party dependencies (report those upstream; tell us
  if Artiline's usage is affected)
- Findings that require a compromised host or physical access
- Self-inflicted misconfiguration of a self-hosted deployment (e.g. a weak
  `AUTH_SECRET`, exposed database)

## Self-hosting note

Self-hosters are responsible for securing their own deployment: a strong
`AUTH_SECRET`, a private database, HTTPS in front of the app, and keeping
dependencies up to date. See [docs/self-hosting.md](./docs/self-hosting.md).
