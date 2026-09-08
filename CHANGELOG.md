# Changelog

All notable changes to Arrakis Control Bot are documented here.

## [1.0.2] - 2026-09-08

### Added

- Regression coverage for blueprint uploads, Discord Adapter response normalization, CAPTCHA verification, moderation authorization, oversized attachments, and non-idempotent request failures.
- Explicit Vitest configuration that excludes generated `dist` tests from source test discovery.

### Changed

- Development mode now runs through `tsx`, and runtime loaders support both TypeScript source files and compiled JavaScript files.
- Moderation, purge, role-selection, and membership-verification interactions acknowledge Discord promptly before performing slower API operations.
- Self-assignable role updates add requested roles before removing deselected roles to reduce partial-update failures.
- CAPTCHA codes now use cryptographically secure randomness and avoid ambiguous characters.
- Startup panel publication failures are isolated so one unavailable panel does not prevent other panels or version announcements from initializing.
- Updated Vitest, Node.js types, and TypeScript ESLint dependencies to their current compatible versions.

### Fixed

- Preserve pawn IDs, controller IDs, character details, status fields, and verification metadata returned by the Discord Adapter.
- Resolve blueprint uploads against the correct linked pawn or controller instead of accidentally selecting an unrelated player with missing identifiers.
- Continue checking valid offline timestamps when an earlier upstream timestamp is malformed.
- Return actionable responses for genuinely missing pawn IDs and stale Discord components instead of leaving failed interactions.
- Prevent `/kick` from checking the target's staff role instead of the requesting moderator's role.
- Enforce requester-versus-target role hierarchy for bans, kicks, and timeouts, including owner and self-action protection.
- Prevent non-idempotent Console API requests from being retried after ambiguous network failures.
- Bound streamed blueprint downloads before buffering the entire attachment in memory.
- Apply timeouts to GitHub release checks and reduce optional unconfigured audit destinations to debug-level noise.

### Security

- Closed an authorization path that could allow a non-staff member to invoke `/kick` against a staff target when the bot's Discord role was high enough.
- Prevent junior staff from moderating peers, senior staff, the guild owner, or themselves through bot commands.
- Removed the vulnerable Vitest dependency chain reported by `npm audit`.

### Verification

- `npm test` passes with 25 tests across 8 test files, including after generating `dist` output.
- `npm run build` passes.
- `npm run lint` passes.
- `npm audit` reports 0 vulnerabilities.
- Source mode loads all 13 commands and 10 component handlers without skips.
- Compiled mode loads all 13 commands, 10 component handlers, and 4 event handlers without skips.

## [1.0.1] - 2026-09-07

### Added

- Release announcements for both Arrakis Control Bot and Arrakis Control Dashboard from their GitHub repositories.
- Project labels in announcement cards and banners, with links to the project repository and full release notes.
- Regression tests for matching project versions and announcement deduplication.

### Fixed

- Track bot and dashboard versions independently so matching version numbers can both be announced.
- Recognize existing bot announcements to avoid reposting releases after the upgrade.
- Publish combined release history in chronological order.

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

[1.0.1]: https://github.com/RealXKenny/Arrakis-Control-Bot/releases/tag/v1.0.1
[1.0.0]: https://github.com/RealXKenny/Arrakis-Control-Bot/releases/tag/v1.0.0
