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
- [ ] Complete dashboard synchronization integration and validate its publication policy.
- [ ] Audit every bot subsystem, command, integration, security boundary, deployment path, and test suite.
- [ ] Rebuild and verify bot services, Discord interactions, persistence, lifecycle, and integrations as needed.
- [ ] Build and verify the authorized Discord management dashboard and its security model.
- [x] Evaluate Discord-Dashboard V3 beta's existing-client, persistence, and sharding constraints.
- [x] Stop partially spawned shard sets when manager startup fails.
- [x] Add a fail-closed, fresh Discord guild permission check routed to the owning shard.
- [x] Add a PostgreSQL-backed dashboard session repository with hashed bearer tokens and bounded expiry.
- [x] Combine session lookup with a fresh shard-routed authorization check for each application-layer access decision.
- [x] Add one-time PostgreSQL OAuth transaction storage, PKCE coordination, and a bounded Discord identity transport.
- [x] Exercise the OAuth, session, authorization, permission-revocation and logout components together against mocked external boundaries.
- [x] Add framework-neutral OAuth, logout, and guild-access HTTP handlers with secure cookies and origin validation; they are not yet mounted.
- [x] Add shared PostgreSQL request limits, expiry cleanup, and a composition factory for dashboard security services; they are not yet running in the bot.
- [ ] Integrate the authorization and session repositories with the dashboard framework and verify end-to-end OAuth.
- [ ] Mount and verify secure HTTP cookies, CSRF/origin enforcement, request limits, scheduled expiry cleanup, and framework integration before exposing OAuth.
- [ ] Design and implement deterministic bot changelog synchronization without changing dashboard release parsing.
- [x] Implement the dashboard read-only versioned changelog API and unified release presentation.
- [x] Add and test a bounded dashboard changelog HTTP client.
- [x] Replace bot GitHub changelog retrieval with validated dashboard API access, bounded caching, and explicit stale/outage handling.
- [ ] Document implemented changes, migration and configuration, and independently versioned releases.
- [ ] Run required checks in both repositories and verify available integrations.
- [ ] Commit scoped changes on both `v2` branches, push without force, and create or update the requested pull requests.

Baseline: the dashboard `v2` checkout contained unrelated uncommitted changes, including `CHANGELOG.md`. Its existing release workflow parses dashboard headings from that file. The bot announcement ledger uses a channel lock and PostgreSQL receipts; keep these protections during the API migration. The original V2 requirements were subsequently restated in the conversation.

Dashboard framework evaluation: `@acstane/dashboard@3.1.0-beta.2` accepts an existing client and a custom settings store, but its lite mode is tied to one process's client and offers only memory or SQLite session backends. The bot has multiple shard processes and uses PostgreSQL. An isolated install produced six high-severity production advisory paths through `@puckeditor/core` and `happy-dom`; the unused package was removed and the production audit returned zero advisories. A separate isolated installation overriding `happy-dom` to 21.0.4 reports zero advisories and passes framework import, DOM, and mocked OAuth/settings smoke tests, but that override exceeds the upstream dependency range and needs full compatibility and security verification before use. The upstream session interface is synchronous, its authorization uses guild access captured at login, and its default request logger logs callback query parameters. The new asynchronous PostgreSQL sessions, OAuth handlers, access service, and fresh cross-shard permission check are not mounted into the framework. Resolve logging, rate limits, session integration, OAuth, revocation, live database behavior, and audit behavior before exposing controls.
