# V2 implementation checklist

This checklist records work against the V2 request. An unchecked item is not complete or verified.

- [x] Inspect both repository branches and worktree status; preserve existing dashboard changes.
- [x] Create the bot `v2` branch from the checked-out `main` baseline.
- [x] Identify the existing GitHub release client, announcement ledger, dashboard changelog parser, and release workflow.
- [x] Bound legacy release-announcement history import and fail closed if it cannot be completed safely.
- [x] Add release archive and SHA-256 attachment and package/lockfile version validation to the bot release workflow.
- [x] Add a tested, manual bot release-history export that preserves the dashboard root changelog.
- [ ] Complete dashboard synchronization integration and validate its publication policy.
- [ ] Audit every bot subsystem, command, integration, security boundary, deployment path, and test suite.
- [ ] Rebuild and verify bot services, Discord interactions, persistence, lifecycle, and integrations as needed.
- [ ] Build and verify the authorized Discord management dashboard and its security model.
- [x] Evaluate Discord-Dashboard V3 beta's existing-client, persistence, and sharding constraints.
- [x] Stop partially spawned shard sets when manager startup fails.
- [ ] Design and implement deterministic bot changelog synchronization without changing dashboard release parsing.
- [x] Implement the dashboard read-only versioned changelog API and unified release presentation.
- [x] Add and test a bounded dashboard changelog HTTP client.
- [x] Replace bot GitHub changelog retrieval with validated dashboard API access, bounded caching, and explicit stale/outage handling.
- [ ] Document implemented changes, migration and configuration, and independently versioned releases.
- [ ] Run required checks in both repositories and verify available integrations.
- [ ] Commit scoped changes on both `v2` branches, push without force, and create or update the requested pull requests.

Baseline: the dashboard `v2` checkout contained unrelated uncommitted changes, including `CHANGELOG.md`. Its existing release workflow parses dashboard headings from that file. The bot announcement ledger uses a channel lock and PostgreSQL receipts; keep these protections during the API migration. The original V2 requirements were subsequently restated in the conversation.

Dashboard framework evaluation: `@acstane/dashboard@3.1.0-beta.2` accepts an existing client and a custom settings store, but its lite mode is tied to one process's client and offers only memory or SQLite session backends. The bot has multiple shard processes and uses PostgreSQL. An isolated install produced six high-severity production advisory paths through `@puckeditor/core` and `happy-dom`; the unused package was removed and the production audit returned zero advisories. Before integration, resolve and test the dependency chain, design cross-shard guild routing and authorization, and verify durable session and audit behavior. Do not expose controls that lack corresponding bot behavior.
