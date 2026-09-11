# Changelog

All notable changes to Arrakis Control Bot are documented here.

## [1.0.6] - 2026-09-10

### Added

- Sapphire-compatible logger adapter that applies the Arrakis timestamp, level, and scope format to framework and `container.logger` output.
- Typed, immutable source catalog containing all 354 Dune Console API endpoints.
- Regression coverage for Sapphire logger formatting, log-level thresholds, endpoint catalog completeness, and catalog immutability.
- API-backed Coriolis storm panels with localized Discord timestamps, a 24-hour storm window derived from `coriolisNextCycleAt`, cycle-level duplicate detection, and automatic restoration when a panel is missing.
- Public `/storm` command for retrieving the current Coriolis schedule on demand.
- Persistent Crimson Skies FAQ panel with a generated Dune-style banner and startup updates in place.

### Changed

- Route Sapphire framework logs through the central `[BOT]` logger so application-command registration, readiness, commands, handlers, listeners, and preconditions share one output format.
- Load the Dune Console endpoint catalog directly from compiled source instead of parsing Markdown from the working directory at startup.
- Updated architecture and setup documentation to describe the compiled endpoint catalog.
- Added dedicated `STORM_CHANNEL_ID` and `FAQ_PANEL_CHANNEL_ID` configuration for automatic panel destinations.

### Fixed

- Prevented duplicate Coriolis announcements while ensuring deleted or absent cycle panels are recreated.

### Verification

- `npm run build`, `npm run lint`, `npm test`, `npm audit --omit=dev`, and `git diff --check` pass for version 1.0.6.

### Removed

- Runtime dependency on external API reference documents.
- The obsolete `docs/` and `scripts/` directories.

## [1.0.5] - 2026-09-09

### Added

- Native `@sapphire/framework` integration, adopting top-level stores (`commands`, `interaction-handlers`, `listeners`, `preconditions`).
- Centralized `ArrakisClient` subclass under `src/client/` for unified client composition and lifecycle management.
- Credential-free store discovery and interaction routing tests under `tests/stores/`.
- Typed fallback handlers for stale message controls and modal submissions.
- Modular framework error boundaries and precondition denial listeners.

### Changed

- Flattened presentation directory structure by removing `src/app/` and placing store directories directly under `src/`.
- Lifted client orchestration (`ArrakisClient`, `BotApplication`, `shard.ts`, `logger.ts`) from `infrastructure/core/` to top-level `src/client/`.
- Reorganized `tests/` to mirror `src/` 1:1 (`tests/client/`, `tests/stores/`, `tests/infrastructure/`, `tests/modules/`, `tests/shared/`).
- Rewrote `PROJECT_STRUCTURE.md` to reflect Clean Architecture domain boundaries and top-level store mappings.

### Removed

- Legacy custom dynamic loaders (`commandLoader.ts`, `componentLoader.ts`, `eventLoader.ts`, `fileLoader.ts`).
- Obsolete manual store path overrides in client composition.
- Redundant and outdated test files in `tests/`.

## [1.0.4] - 2026-09-09

### Changed

- Release changelog messages sent to Discord Announcement channels are now published automatically after posting.
- Ticket archive JSON now references transcript metadata instead of duplicating the full transcript that is already stored in PostgreSQL and attached as a `.txt` file.

### Fixed

- Bound combined Components V2 display text for release announcements, ticket cards, ticket archives, closure receipts, audit logs, server status, VPS server lists, backups, player lists, and profiles.
- Bound API-provided traditional reply content to Discord's 2,000-character message limit.
- Normalize release and audit attachment filenames and preserve their extensions within a safe length.
- Skip oversized blueprint audit re-uploads and stream accepted attachments through a 10 MiB bounded reader.
- Keep ticket archive and closure payloads below Discord's per-file and total request-size limits without discarding the authoritative PostgreSQL transcript.

### Verification

- `npm run build`, `npm run lint`, `npm test`, `npm audit --omit=dev`, and `git diff --check` pass for version 1.0.4.

## [1.0.3] - 2026-09-09

### Added

- PostgreSQL-backed ticket storage with automatic schema upgrades, active-ticket uniqueness, and lifecycle metadata.
- Exclusive scoped Dune Console API-key authentication.
- Persistent Dune-styled support panel with category-first private ticket creation for account linking, technical support, player reports, guild and community help, gameplay and server help, and general requests.
- Detailed ticket intake for support type, description, prior troubleshooting, and impact or urgency.
- Automatic linked Dune character enrichment, including character name, online status, pawn ID, and controller ID when available.
- Durable ticket transcripts stored in PostgreSQL, with an optional `.txt` copy posted to a configured Discord archive channel.
- Private ticket-closure receipts containing the full request, linked Dune details, closure metadata, transcript attachment, and review prompt.
- PostgreSQL-backed ticket reviews with a 1-5 rating, resolution status, optional comments, submission timestamp, and in-place staff archive updates.
- Staff ticket claiming and release controls with durable handler identity, claim time, and protection against another staff member closing an assigned ticket.
- One persistent archive container per ticket with complete lifecycle, intake, linked Dune account, handler, transcript, and review information plus `.txt` and structured `.json` attachments.
- Regression coverage for ticket channel names, linked-account presentation, transcript content, and PostgreSQL environment validation.

### Changed

- Console startup now requires `CONSOLE_API_KEY`; password login and all browser-session, cookie, CSRF, reauthentication, and logout code have been removed.
- Ticket categories are selected from the panel and carried into the modal, PostgreSQL record, and private channel name instead of relying on a free-form category answer.
- The ticket panel now uses a larger purpose-built support banner, balanced category artwork, shorter guidance, and cleaner privacy/status callouts.
- Closing a ticket now captures its conversation and attachment references, archives the transcript, and automatically deletes the private Discord channel.
- Member reviews now edit the ticket's original archive container and replace its JSON record instead of posting a separate review message.
- Ticket closure now attempts the creator's DM receipt before deleting the channel and reports blocked DMs to the closer without interrupting archival.
- The bot now requests the `GuildMessages` and privileged `MessageContent` intents required for complete ticket transcripts.
- Runtime configuration and architecture documentation now cover PostgreSQL, ticket channels, transcript archives, and hosted-database TLS.
- Local development now runs a single shard directly by default, with explicit watch and single-process production scripts available when sharding is unnecessary.

### Fixed

- Detect parent-process and shard-manager IPC loss so Windows development and managed shutdowns do not leave orphaned Node.js shard processes behind.
- Wait for shard children during manager shutdown, force only after a bounded timeout, and prevent cleanup failures from blocking process exit.

### Security

- Console API requests reject cross-origin routes before attaching bearer credentials.
- Console URLs containing embedded username or password credentials are rejected so bearer API keys remain the only Console authentication path.
- Ticket channels are visible only to the creator, the bot, and configured staff roles.
- PostgreSQL enforces one active ticket per member and server, including concurrent creation attempts.
- Ticket creation rolls back both the database reservation and Discord channel when provisioning fails.

### Verification

- `npm run build`, `npm run lint`, `npm test`, `npm audit --omit=dev`, and `git diff --check` pass for the in-progress 1.0.3 changes.

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

[1.0.6]: https://github.com/RealXKenny/Arrakis-Control-Bot/compare/v1.0.5...HEAD
[1.0.5]: https://github.com/RealXKenny/Arrakis-Control-Bot/releases/tag/v1.0.5
[1.0.4]: https://github.com/RealXKenny/Arrakis-Control-Bot/releases/tag/v1.0.4
[1.0.3]: https://github.com/RealXKenny/Arrakis-Control-Bot/releases/tag/v1.0.3
[1.0.2]: https://github.com/RealXKenny/Arrakis-Control-Bot/releases/tag/v1.0.2
[1.0.1]: https://github.com/RealXKenny/Arrakis-Control-Bot/releases/tag/v1.0.1
[1.0.0]: https://github.com/RealXKenny/Arrakis-Control-Bot/releases/tag/v1.0.0
