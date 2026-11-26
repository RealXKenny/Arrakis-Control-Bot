# Single-guild stability and scale plan

The bot serves one large Discord guild with heavy traffic. Sharding does not spread one guild's load: every event for that guild arrives on one shard process. This plan lists what to change so that process stays responsive under load, recovers on its own, and stays maintainable. Items are ordered by risk. Each item names the code involved and how we know it is done.

Status (2026-11-26): every item is implemented in code, with these differences from the plan. XP writes are not buffered; the in-memory cooldown skips the database instead. Health uses a log line and an optional `HEALTH_FILE` instead of HTTP endpoints, because the bot opens no port. Canvas cards encode on the thread pool and static banners are cached, but drawing still runs on the main thread. Migrations start from a recorded V2 baseline, and repository initializers stay idempotent. Load tests use simulated PostgreSQL latency, not a real database. Live verification on the production host is still open; the [V2 checklist](v2-implementation-checklist.md) tracks status.

## P0: protect the hot path

These issues can make the bot slow or unresponsive during a busy hour.

1. **Separate database work by priority.** One `pg` pool of 10 connections (`TicketRepository`) is shared by tickets, panels, leveling, the message archive, music, voice and honeypot statistics. Every guild message causes an archive insert and a leveling update, and `pg` queues waiting queries without a limit. A message burst can delay `/ticket`, panels and interaction replies until Discord's 3-second acknowledgement window expires.
   - Give interactive work (commands, panels, tickets) its own pool, separate from background writes (archive, XP, statistics).
   - Make both pool sizes configurable (`DATABASE_POOL_MAX`, `DATABASE_BACKGROUND_POOL_MAX`) and set `statement_timeout` and `query_timeout`.
   - Done when a load test with sustained message traffic keeps interaction acknowledgement under 1 second at p99.
2. **Batch per-message writes.** `MessageArchiveService.created` and `LevelingService.handleMessage` each make their own round trips per message.
   - Buffer archive inserts and XP awards in memory and flush every 1 to 2 seconds or every N rows as multi-row statements.
   - Cap the buffer. When it is full, drop new archive rows and keep XP. Count what was dropped and log it instead of growing memory.
   - Flush on shutdown before the pool closes.
3. **Acknowledge interactions before any I/O.** Audit every command and component handler for database or HTTP work that runs before `deferReply`/`deferUpdate`. Add a test helper that fails when a handler awaits a mocked boundary before acknowledging.
4. **Bound Discord caches.** `ArrakisClient` uses the default caches. With `MessageContent` and `GuildMembers` in a large guild, the message and member caches grow with activity.
   - Configure `makeCache` limits and `sweepers` (messages older than about 30 minutes, inactive threads).
   - Keep members cached because leveling and authorization need them, but stop forcing fetches in hot paths.
5. **Retention for the message archive.** `MessageArchiveRepository` has no purge. In a busy guild the table and its indexes grow without limit.
   - Add a configurable retention period (for example `MESSAGE_ARCHIVE_RETENTION_DAYS=90`) and a batched nightly delete.
   - Add the archive to the shared expiry cleanup.

## P1: stay up and recover on its own

6. **Run as one shard by default.** `TOTAL_SHARDS=auto` still spawns a child process . For one guild, default to `TOTAL_SHARDS=1` and document when to change it. Keep the cross-shard code paths for safety.
7. **Health and readiness.** Add an internal `/healthz` (liveness) and `/readyz` (gateway connected, database reachable, recent heartbeat), bound to localhost or a private port only, since the bot otherwise has no HTTP listener. Point the Pterodactyl or Docker health checks and any external monitor at it.
8. **Metrics.** Track event-loop lag, interaction acknowledgement latency, pool wait time and size, write-buffer depth and drops, Discord REST 429s, Dune API latency and errors, and cache sizes. Log a short summary every minute, and optionally expose Prometheus text on the internal port.
9. **Event-loop protection.** Panel artwork rendering uses `canvas` on the main thread. Move heavy rendering to a worker pool, or cache rendered banners by input hash, so image work cannot stall the gateway heartbeat.
10. **Upstream resilience.** The Dune Console client has timeouts but no circuit breaker or shared cache.
    - Add a per-endpoint circuit breaker that fails fast with the existing safe message after repeated failures.
    - Add short, shared caches for hot read-only endpoints (server status, player lookups), as `/leaderboard` already does.
    - Limit concurrent Dune and Convoy calls per endpoint.
11. **Rate limits that survive restarts.** `InMemoryRateLimiter` is per process and resets on restart. For one guild, keep it in memory, but add per-user and per-command limits for expensive commands (Dune Console, backups, market). Return clear cooldown messages instead of queueing.
12. **Graceful degradation when PostgreSQL is down.** Today startup fails if PostgreSQL is unreachable, and several features have no fallback while it runs. Start in a degraded mode, retry the connection with backoff, and disable persistence-dependent panels with a clear status instead of crash-looping.

## P2: future-proofing

13. **Versioned migrations.** Tables are created with scattered `CREATE TABLE IF NOT EXISTS` in each repository's `initialize`. Move to ordered, numbered migrations with a `schema_migrations` table, run once at startup under an advisory lock, and add a check that refuses to start on an unknown newer schema.
14. **Load and soak tests.** Add a reproducible load harness, using a mocked gateway and REST boundary against a real PostgreSQL in CI, that replays N messages per second plus interactions. Fail CI when p99 acknowledgement or pool wait time regresses past a budget.
15. **Dependency hygiene.** Pin Node 24 in CI (already done) and in the egg. Add Dependabot or Renovate with grouped weekly updates.
16. **Backups and restore drills.** Document `pg_dump` scheduling for the bot database and run a restore drill before each major release.
17. **Runbook.** Add `guides/operations.md` covering restart order, what each health signal means, how to drain the write buffer, and how to roll back a release with the source-archive installer.

## Suggested order

P0 items 1 and 2 together, then 3, 4 and 5, then health and metrics (7, 8) so the rest can be measured, then the remaining items.
