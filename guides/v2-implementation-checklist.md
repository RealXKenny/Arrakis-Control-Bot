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
- [ ] Design and implement deterministic bot changelog synchronization without changing dashboard release parsing.
- [ ] Implement the dashboard read-only versioned changelog API and unified release presentation.
- [ ] Replace bot GitHub changelog retrieval with validated dashboard API access, bounded caching, and explicit stale/outage handling.
- [ ] Document implemented changes, migration and configuration, and independently versioned releases.
- [ ] Run required checks in both repositories and verify available integrations.
- [ ] Commit scoped changes on both `v2` branches, push without force, and create or update the requested pull requests.

Baseline: the dashboard `v2` checkout contained unrelated uncommitted changes, including `CHANGELOG.md`. Its existing release workflow parses dashboard headings from that file. The bot announcement ledger uses a channel lock and PostgreSQL receipts; keep these protections during the API migration. The original V2 requirements were subsequently restated in the conversation.
