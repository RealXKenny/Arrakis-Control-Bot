# V2 implementation checklist

This checklist records work against the V2 request. An unchecked item is not complete or verified.

- [x] Inspect both repository branches and worktree status; preserve existing dashboard changes.
- [x] Create the bot `v2` branch from the checked-out `main` baseline.
- [x] Identify the existing GitHub release client, announcement ledger, dashboard changelog parser, and release workflow.
- [x] Bound legacy release-announcement history import and fail closed if it cannot be completed safely.
- [x] Add release archive and SHA-256 attachment and package/lockfile version validation to the bot release workflow.
- [x] Replace bot-specific GHCR publication with dashboard-style source releases and a Node.js 24 Pterodactyl egg.
- [ ] Verify the release installer and native canvas against the target Pterodactyl runtime before deployment.
- [x] Add a tested, manual bot release-history export that preserves the dashboard root changelog.
- [x] Complete dashboard synchronization integration and document its publication policy. Live posting still needs checking in the production channel.
- [x] Audit every bot subsystem, command, integration, security boundary, deployment path, and test suite ([security audit](security-audit.md), interaction acknowledgement audit).
- [x] Rebuild bot services, Discord interactions, persistence, lifecycle, and integrations as needed. Live verification is the item below.
- [x] Remove the in-bot management dashboard before launch (decision 2026-11-26); revisit after launch with a separate security review.
- [x] Evaluate Discord-Dashboard V3 beta's existing-client, persistence, and sharding constraints.
- [x] Stop partially spawned shard sets when manager startup fails.
- [x] Design and implement deterministic bot changelog synchronization without changing dashboard release parsing (manual reviewed export plus a fixed post order; see `guides/changelog-synchronization.md`).
- [x] Implement the dashboard read-only versioned changelog API and unified release presentation.
- [x] Add and test a bounded dashboard changelog HTTP client.
- [x] Replace bot GitHub changelog retrieval with validated dashboard API access, bounded caching, and explicit stale/outage handling.
- [x] Single-guild stability and scale, per [the plan](single-guild-scale-plan.md):
  - [x] Split interactive and background PostgreSQL pools with configurable sizes and query timeouts.
  - [x] Batch message-archive writes with a bounded buffer flushed before edits, deletes and shutdown; skip XP database work inside the cooldown.
  - [x] Verify every interaction is acknowledged before slow I/O.
  - [x] Bound Discord message caches with sweepers.
  - [x] Add optional message-archive retention and batched purge (off by default).
  - [x] Default to one shard for a single guild.
  - [x] Add health signals and runtime metrics (log summary and optional `HEALTH_FILE`; no HTTP port).
  - [x] Keep canvas rendering off the gateway event loop.
  - [x] Add circuit breakers, shared caches and concurrency limits for Dune Console and Convoy.
  - [x] Add per-user cooldowns for expensive commands.
  - [x] Degrade gracefully and reconnect when PostgreSQL is unavailable.
  - [x] Replace ad hoc table creation with versioned migrations.
  - [x] Add load and soak tests with latency budgets in CI.
  - [x] Add dependency update automation, a backup and restore drill, and an operations runbook.
- [x] Document implemented changes, migration and configuration, and independently versioned releases (CHANGELOG, README, `guides/operations.md`).
- [ ] Run required checks in both repositories and verify available integrations.
- [x] Commit scoped changes on both `v2` branches, push without force, and create or update the requested pull requests.

Baseline: the dashboard `v2` checkout contained unrelated uncommitted changes, including `CHANGELOG.md`. Its existing release workflow parses dashboard headings from that file. The bot announcement ledger uses a channel lock and PostgreSQL receipts; keep these protections during the API migration. The original V2 requirements were subsequently restated in the conversation.

Dashboard framework evaluation: `@acstane/dashboard@3.1.0-beta.2` was evaluated and briefly mounted behind an allowlisted gateway, then removed with all in-bot OAuth, session and rate-limit code before launch to reduce the attack surface. Notes for a future attempt: the framework's in-process dispatch loses async context, its sessions are synchronous with guild access captured at login, its default request logger logs callback query strings, and clearing its production advisories needed a `happy-dom` override outside the upstream range. The removed code is in git history (commit 0cc1458 and earlier).
