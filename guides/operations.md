# Operations runbook

How to run, watch, back up and roll back the bot in production. It assumes the Pterodactyl egg ([guides/pterodactyl.md](pterodactyl.md)) and one PostgreSQL database.

## Start, stop and restart

- Start order: PostgreSQL, then the bot. Lavalink and RabbitMQ can start in either order; the bot reconnects to them.
- If PostgreSQL is not reachable at startup, the bot logs `PostgreSQL is not ready (attempt N)` and retries with a growing delay (2 seconds up to 1 minute) instead of crash-looping. It connects to Discord once the database answers.
- If PostgreSQL restarts while the bot runs, the bot logs that a connection failed and was dropped. The next query opens a new connection. Commands that need the database show their normal "temporarily unavailable" message during the outage.
- Give the server at least 15 seconds to stop. On shutdown the bot writes the message-archive buffer, then closes the database.
- One shard (`TOTAL_SHARDS=1`) is the default and right for one server. Discord always serves one server from one shard, so more shards do not spread its load.

## Health signals

The bot samples its health every `RUNTIME_METRICS_INTERVAL_SECONDS` (default 60). The console shows one `METRICS` line every five minutes, and at once whenever a sample has a warning, a Discord rate limit, or a change in gateway, database or circuit health. For example:

```
ready=yes | ping=48ms | loop p99=12ms max=40ms | heap=180MB rss=310MB | db=up (interactive 2/10 busy, 0 waiting; background 1/5 busy, 0 waiting) | archive buffer=35 | cached messages=4100 | 429s=0
```

| Signal | Healthy | What to do when it is not |
| --- | --- | --- |
| `ready` | `yes` | `no` means the gateway is down or PostgreSQL is not answering. Check the warnings printed below the line. |
| `ping` | Under 250 ms | Discord or network trouble; usually clears by itself. |
| `loop p99` | Under 200 ms | A warning appears above 200 ms. Interactions may miss Discord's 3-second window. Check for a long job (backups, big panels) and the host's CPU. |
| `db` waiting | 0 | Interactive queries waiting for a connection. Raise `DATABASE_POOL_MAX` (keep the total under PostgreSQL's `max_connections`). |
| `archive buffer` | Under a few thousand | The archive cannot keep up. A "Dropped N message(s)" error means the 10,000-row buffer filled; check database health. |
| `429s` | Near 0 | Discord REST rate limits in the last interval. Sustained values mean a feature is sending too much. |
| `open circuits` | Absent | The Dune Console or hosting panel failed 5 times in a row; calls to that area fail fast for 30 seconds, then one trial call is allowed. |

Set `HEALTH_FILE` (for example `/home/container/health.json`) to have the bot rewrite the same data as JSON each interval. A container health check can read `ready` from it and treat a file older than three intervals as unhealthy. The bot opens no network port.

## Database backups

Back up the bot database daily and before every upgrade. From a host that can reach PostgreSQL:

```bash
pg_dump --format=custom --no-owner --file="arrakis-$(date +%F).dump" "$DATABASE_URL"
```

Keep at least 7 daily and 4 weekly copies somewhere other than the database host. The dump contains archived Discord messages and ticket transcripts, so store it as private data.

### Restore drill

Run this before each major release and after changing the backup setup. Use a scratch database, never production.

1. Create an empty database: `createdb arrakis_restore_test`.
2. Restore: `pg_restore --no-owner --dbname=arrakis_restore_test arrakis-YYYY-MM-DD.dump`.
3. Check the schema version and row counts:
   ```sql
   SELECT max(version) FROM schema_migrations;
   SELECT count(*) FROM tickets;
   SELECT count(*) FROM bot_discord_messages;
   ```
4. Point a test bot (its own token and test server) at the restored database and start it. It must start without a schema error, opening a ticket from the ticket panel must work, and `/level` must show restored levels.
5. Write down the date, dump size, restore time and any problems. Drop the scratch database.

## Upgrades and rollbacks

1. Take a database backup.
2. With [automatic updates](automatic-updates.md) on, restart the server (or wait for the next check); with them off, set `RELEASE_TAG` to the new version and restart. The updater verifies the release, builds it in staging and refuses to overwrite files you changed.
3. Start the bot. It applies pending database migrations under a lock, then starts. Each migration runs in its own transaction.
4. Watch the first few `METRICS` lines.

To roll back by hand, set `AUTO_UPDATE_ENABLED=false`, restore the previous release's files from `.arrakis/backups/` or a fresh install of that version, and restart (automatic updates never downgrade). If the newer release applied a migration, the older bot refuses to start with "The database schema is at version N, but this bot only knows up to M". Restore the backup taken in step 1 (or run the newer release again). This is deliberate: old code must not run against a schema it does not understand.

## Message archive retention

`MESSAGE_ARCHIVE_RETENTION_DAYS=0` (the default) keeps every archived message. A positive value deletes older messages and their edit history in batches every hour. Deletion cannot be undone, so take a backup first and choose the period with your moderators.

## Before launch

- Turn off **Public Bot** in the Discord developer portal. The bot also leaves any server not in `ALLOWED_GUILD_IDS`.
- Rotate the bot token, Dune Console key and database password if they were ever shared outside the deployment secrets.
- Confirm on the Discord Adapter service that player-link codes are single-use, expire and have an attempt limit.
- Run the restore drill once.
