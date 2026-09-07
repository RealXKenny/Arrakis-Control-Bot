# Changelog

All notable changes to Arrakis Control Bot are documented here.

## [1.0.0] - 2026-09-06

Initial production release.

### Added

- Modular Discord.js v14 bot architecture with dynamic command, component, and event loading.
- General commands for ping, information, user lookup, and message purging.
- Moderation commands for bans, kicks, and timeouts with execution-time permission checks.
- Player linking, verification, profile, and player listing workflows.
- Server status, server listing, and backup management commands through the Dune Console API.
- Blueprint upload validation and panel workflow for Discord-hosted blueprint files.
- Self-assignable role panel and member CAPTCHA verification flow.
- Persistent panel publishing for rules, server information, player linking, verification, roles, and blueprint uploads.
- Convoy and Discord Adapter integrations with bounded request timeouts and safe error handling.
- Dune Console client with authentication, typed endpoint access, safe idempotent retries, and logout during shutdown.
- Process-local rate limiting with bounded storage and configurable cooldown and entry limits.
- Structured logging with configurable levels and redaction of credentials and authorization headers.
- Shard manager lifecycle with graceful shutdown on `SIGINT` and `SIGTERM`.
- Strict TypeScript compilation, ESLint checks, credential-free automated tests, and reproducible npm dependency locking.
- Runtime configuration template and deployment guidance for Node.js 24 or newer.

### Security

- Required runtime configuration fails fast before Discord login.
- Production integration URLs require HTTPS.
- Privileged actions validate authorization when executed.
- Blueprint URLs are restricted to Discord CDN hosts and checked against upload size limits.
- External API failures are reduced to safe user-facing messages.
- Secrets and generated build output are excluded from version control.

### Verification

- `npm run build` passes.
- `npm run lint` passes.
- `npm test` passes with 9 tests across 4 test files.
- `npm audit --audit-level=high` reports 0 vulnerabilities.

[1.0.0]: https://github.com/RealXKenny/Arrakis-Control-Bot/releases/tag/v1.0.0