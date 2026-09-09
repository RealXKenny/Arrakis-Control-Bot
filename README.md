# Arrakis Control Bot

Production-oriented TypeScript Discord.js bot for Dune: Awakening community administration, player linking, moderation, server operations, panels, and external service integrations.

See [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) for the ownership map of the codebase and [docs/](docs/) for upstream API references.

Release history is tracked in [CHANGELOG.md](CHANGELOG.md). The current main-branch version is 1.0.4.

## Requirements

- Node.js 24 or newer
- A Discord bot token with the intents and permissions used by the configured commands
- A reachable Dune Console HTTPS endpoint and a scoped API key
- Optional Convoy and Discord Adapter credentials for their integrations
- PostgreSQL when the support ticket system is enabled

Copy `.env.example` to `.env` and fill in the required values. Never commit `.env` or credentials.

Required variables are `TOKEN`, `CONSOLE_URL`, and `CONSOLE_API_KEY`. Every Dune Console request sends `Authorization: Bearer <key>` and relies on the key's configured scopes; grant only the read/write namespaces needed by the bot features you enable. Password login, browser sessions, cookies, CSRF handling, and automatic reauthentication are not supported by the bot. Invalid or expired keys return HTTP 401, insufficient scopes return HTTP 403, and key rate limits return HTTP 429. `CLIENT_ID` enables global slash-command deployment. `GUILD_ID` is reserved for development configuration and is not used for global deployment. Optional Convoy and Discord Adapter integrations require their corresponding API key/token.

The ticket system is enabled when `DATABASE_URL` is configured. On startup, the bot creates and upgrades its ticket table and indexes automatically. Set `TICKET_PANEL_CHANNEL_ID` to the channel where members open tickets and `TICKET_CATEGORY_ID` to the category that should contain private ticket channels. Set `TICKET_TRANSCRIPT_CHANNEL_ID` to receive one persistent archive container per ticket with both `.txt` and structured `.json` records; the transcript is always retained in PostgreSQL. `DATABASE_SSL=true` enables TLS for hosted PostgreSQL services. Ticket access is granted to the creator and any configured staff roles; members may have one active ticket per server. Configured staff can claim and release tickets, and the claimant is recorded as the handler. Other staff cannot close a claimed ticket until its handler releases it; closing an unclaimed ticket as staff automatically assigns the closer. The panel routes members through Account & Linking, Technical Support, Player Report, Guild & Community, Gameplay & Server, or General & Other. The selected category is stored with the full details, troubleshooting already attempted, and impact/urgency. When the Discord Adapter is available, linked Dune character identity and online status are recorded with the private ticket. Closing a ticket saves its conversation and attachment references, sends the creator a complete DM receipt with the transcript and review button, then deletes its Discord channel. Submitted ratings, resolution status, comments, and review timestamps are retained in PostgreSQL and update the original archive container and JSON record instead of creating a second message. Members who disable DMs cannot receive the receipt, but closure and database archival still complete.

Ticket transcripts require the Discord **Message Content Intent**. Enable it for the bot application in the Discord Developer Portal; the runtime now requests both `GuildMessages` and `MessageContent` gateway intents.

## Development

```powershell
npm install
npm run build
npm test
npm run lint
npm run dev
```

`npm run dev` runs one bot shard directly for the smallest local process tree. Use `npm run dev:watch` when automatic TypeScript restarts are useful. Stop either mode with `Ctrl+C` so the bot can close Discord and PostgreSQL cleanly.

`LOG_LEVEL` accepts `DEBUG`, `INFO`, `WARN`, `ERROR`, or `FATAL`. `TOTAL_SHARDS` accepts `auto` or a positive integer. `INTERACTION_COOLDOWN_MS` and `RATE_LIMIT_MAX_ENTRIES` configure the bounded process-local limiter. In production, integration URLs must use HTTPS.

Before starting a release, run the same checks used by CI/deployment:

```powershell
npm run build
npm run lint
npm test
npm audit
```

## Production

Build and start the compiled shard manager:

```powershell
npm ci
npm run build
npm start
```

`npm start` uses the shard manager and therefore runs a manager plus one or more shard child processes. `npm run start:single` runs one compiled shard directly when Discord sharding is not needed. Both manager and shard processes monitor their parent and shut down if that parent disappears, including when a Windows npm host process is terminated.

The manager deploys application commands globally when `CLIENT_ID` is configured. It spawns Discord shards, logs shard failures, and exits on fatal process errors so an external process manager can restart it. `SIGINT` and `SIGTERM` trigger bounded graceful shutdown, including scheduled task cleanup, PostgreSQL pool closure, and Discord client destruction. Keep exactly one manager instance for a deployment unless shared coordination is added.

Keep command deployment credentials and API secrets in the runtime environment. Use a process manager or container supervisor for restart policy, and configure its health/readiness checks around shard readiness and application logs.

Rate limiting is intentionally process-local and sufficient for this single-process-per-shard deployment. A multi-instance deployment must provide a shared `RateLimitStore` implementation, such as Redis, before relying on limits across instances.

### Process manager expectations

- Restart on non-zero exit.
- Do not run multiple copies against the same deployment unless command deployment and scheduled work are coordinated.
- Pass environment variables through the process manager's secret/configuration facility.
- Forward `SIGTERM` and allow at least 15 seconds for graceful shutdown.
- Collect stdout/stderr and alert on `FATAL`, shard death, or repeated startup failure messages.

### Verified startup

The production start path was previously verified with configured live services. After moving to API-key-only Console authentication, run a deployment smoke test to confirm the configured key scopes, Discord readiness, and panel updates in the target environment.

## Troubleshooting

- Missing or blank `CONSOLE_API_KEY` fails startup before Discord login. `CONSOLE_PASSWORD` is no longer read.
- An API-key-authenticated request returning HTTP 403 usually means the key is valid but lacks the scope required by that command.
- The first command that reaches the Dune Console will expose an invalid key or missing scope through its safe API error response.
- `CLIENT_ID` may be omitted when commands are managed externally; the bot will skip deployment and still start.
- Use `LOG_LEVEL=DEBUG` temporarily when diagnosing integration or interaction failures. Logs do not intentionally include tokens or authorization headers.

## Architecture

The application is intentionally modular. Discord event modules translate gateway events into application actions, infrastructure clients own external I/O, and shared utilities contain reusable validation and state primitives. Keep new external integrations under `src/infrastructure/api/`, domain behavior under `src/modules/`, and Discord presentation/interaction wiring under `src/app/`.

## Security notes

- Secrets are loaded from environment variables and excluded by `.gitignore`.
- Privileged actions validate authorization when executed; hiding a command or button is not the security boundary.
- Uploaded blueprint URLs are restricted to Discord CDN hosts and are size-checked before forwarding.
- External API errors are logged internally but reduced to safe user-facing messages.
- Automatic retries are limited to safe/idempotent Dune Console methods.
