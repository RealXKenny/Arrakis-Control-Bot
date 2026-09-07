# Arrakis Control Bot

Production-oriented TypeScript Discord.js bot for Dune: Awakening community administration, player linking, moderation, server operations, panels, and external service integrations.

See [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) for the ownership map of the codebase and [docs/](docs/) for upstream API references.

Release history is tracked in [CHANGELOG.md](CHANGELOG.md). The current release is [1.0.1](https://github.com/RealXKenny/Arrakis-Control-Bot/releases/tag/v1.0.1).

## Requirements

- Node.js 24 or newer
- A Discord bot token with the intents and permissions used by the configured commands
- A reachable Dune Console HTTPS endpoint and password
- Optional Convoy and Discord Adapter credentials for their integrations

Copy `.env.example` to `.env` and fill in the required values. Never commit `.env` or credentials.

Required variables are `TOKEN`, `CONSOLE_URL`, and `CONSOLE_PASSWORD`. `CLIENT_ID` enables global slash-command deployment. `GUILD_ID` is reserved for development configuration and is not used for global deployment. Optional Convoy and Discord Adapter integrations require their corresponding API key/token.

## Development

```powershell
npm install
npm run build
npm test
npm run lint
npm run dev
```

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

The manager deploys application commands globally when `CLIENT_ID` is configured. It spawns Discord shards, logs shard failures, and exits on fatal process errors so an external process manager can restart it. `SIGINT` and `SIGTERM` trigger bounded graceful shutdown, including scheduled task cleanup, Dune Console logout, and Discord client destruction. Keep exactly one manager instance for a deployment unless shared coordination is added.

Keep command deployment credentials and API secrets in the runtime environment. Use a process manager or container supervisor for restart policy, and configure its health/readiness checks around shard readiness and application logs.

Rate limiting is intentionally process-local and sufficient for this single-process-per-shard deployment. A multi-instance deployment must provide a shared `RateLimitStore` implementation, such as Redis, before relying on limits across instances.

### Process manager expectations

- Restart on non-zero exit.
- Do not run multiple copies against the same deployment unless command deployment and scheduled work are coordinated.
- Pass environment variables through the process manager's secret/configuration facility.
- Forward `SIGTERM` and allow at least 15 seconds for graceful shutdown.
- Collect stdout/stderr and alert on `FATAL`, shard death, or repeated startup failure messages.

### Verified startup

The production start path has been verified with configured live services: the bot loaded commands and components, authenticated with the Dune Console, deployed commands, logged into Discord, reached shard readiness, and updated configured panels. This does not replace ongoing monitoring or deployment-level health checks.

## Troubleshooting

- Missing required environment variables fail startup before Discord login.
- A failed Dune Console login prevents the shard from becoming ready.
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
