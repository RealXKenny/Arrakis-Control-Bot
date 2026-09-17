# Arrakis Control Bot

Production-oriented TypeScript Sapphire Framework and Discord.js bot for Dune: Awakening community administration, player linking, moderation, server operations, panels, and external service integrations.

See [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) for the ownership map of the codebase. The Dune Console endpoint catalog is compiled directly into `src/infrastructure/http/dune-console/endpointCatalog.ts`, so production startup does not depend on external reference files.

Release history is tracked in [CHANGELOG.md](CHANGELOG.md). The current main-branch version is 1.0.9.

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

## Discord ↔ game chat over RabbitMQ

See the [complete RabbitMQ ↔ Discord setup guide](guides/rabbitmq-discord.md) for remote-broker setup, TLS, authentication, database personas, seven-map routing and troubleshooting. The optional bridge supports one shared Discord channel or separate channels per map.

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

Sapphire discovers application commands from its command store and synchronizes their global registrations with overwrite behavior from shard zero. The manager spawns Discord shards, logs shard failures, and exits on fatal process errors so an external process manager can restart it. `SIGINT` and `SIGTERM` trigger bounded graceful shutdown, including scheduled task cleanup, PostgreSQL pool closure, and Discord client destruction. Keep exactly one manager instance for a deployment unless shared coordination is added.

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
- `CLIENT_ID` remains optional configuration; Sapphire uses the authenticated application when synchronizing registered commands.
- Use `LOG_LEVEL=DEBUG` temporarily when diagnosing integration or interaction failures. Logs do not intentionally include tokens or authorization headers.

## Weekly Coriolis storm panel

Set `STORM_CHANNEL_ID` in `.env` to choose the Discord channel and enable a Components V2 panel with an attached Dune banner, start/end dates, and live Discord countdowns. Every minute, the bot reads `coriolisNextCycleAt` from `GET /api/map/markers`, uses it as the storm end, and calculates the start as exactly 24 hours earlier. It checks for that cycle's marker in the configured channel and sends the panel when none exists, including restoring a panel deleted during an active cycle.

The Console API key needs read access to the `map` namespace. The bot accepts an ISO timestamp, Unix seconds, or Unix milliseconds from the API. It ignores an expired API cycle and restores a missing panel while the reported cycle is still active.

Users can also run `/storm` at any time to retrieve the current API-backed storm panel. This command works independently of `STORM_CHANNEL_ID`.

Grant View Channel, Read Message History, Send Messages, Attach Files, and Embed Links in the destination. History checks recognize the bot's own cycle marker across restarts, including busy channels; failed reads/sends retry on the next minute. Keep prior panels for duplicate protection. Only shard 0 publishes; run one bot deployment to avoid races between separate deployments. No role or everyone mentions are sent. Restart after changing configuration. Leaving `STORM_CHANNEL_ID` unset disables the feature.

## CHOAM market command

Users can run `/market` to browse active CHOAM Exchange sell orders grouped by item and grade. Results show each item's lowest asking price, total stock, listing count, and a recommended listing price calculated from the Market Bot's saved buyback percentage. The interactive panel provides an All Categories/category menu and First, Previous, Next, and Last page buttons. Optional `search`, `category`, `seller`, and `page` arguments set the initial view; `seller` defaults to all sellers. Controls are bound to the requesting member and expire after 15 minutes.

The command reads `GET /api/exchange/items` through the configured Dune Console API key and never changes exchange rows. Ensure that key is permitted to read the exchange endpoint. If the game database does not support the exchange schema, the command reports the capability as unavailable.

## Interactive command help

Run `/help` to open the private Arrakis Command Center. It catalogs all 77 standalone commands across 14 practical categories, shows Everyone, Staff, and Owner access badges, and provides category and page controls bound to the requesting member. The optional `category` argument opens a specific section immediately; interactive sessions expire after 15 minutes.

## Owner server controls

Members with the configured `OWNER_ROLE_ID` can run `/start-server`, `/stop-server`, `/restart-server`, `/fix-network`, `/cleanup-images`, `/cleanup-build-cache`, `/services`, and `/restart-service service:<name>`. Each standalone owner-only command calls the matching Dune Console endpoint and responds ephemerally. `/services` lists current service status and provides the names accepted by `/restart-service`. Storage cleanup requests include the Console's exact required confirmation phrase. The Console API key must have permission to execute server operations.

`/restart-server` and `/restart-service` accept an optional `immediate` flag. Normal requests respect the Console Restart Queue and report queued `202` responses; `immediate:true` sends `restartQueue=immediate` to bypass its countdown. Concurrency-conflict `409` responses are shown in the ephemeral error panel.

## Owner update controls

Owners can use `/check-game-update`, `/apply-game-update`, `/fix-steamcmd`, `/check-stack-update`, `/apply-stack-update`, `/auto-update-status`, `/configure-auto-update`, and `/repair-runtime`. `/check-game-update` accepts the optional `fresh` flag. `/configure-auto-update` requires all documented automatic-update fields and forwards its `confirmation` value to the Console. All update responses are ephemeral.

## Backup controls

`/backups` remains the read-only overview for the backup list and automatic-backup status. Owners can use `/create-backup`, `/restore-backup`, `/download-backup`, `/delete-backup`, `/delete-all-backups`, `/import-backup`, and `/configure-auto-backup` for the remaining Console backup operations. Restore and deletion commands require an explicit `confirm:true`; responses are ephemeral.

External imports require both the backup archive and its metadata as Discord attachments and are limited to 25 MB combined. Downloads are returned as ephemeral Discord attachments and are limited to 10 MB; larger archives must be retrieved directly through the Console.

## Owner player administration

Owners have 38 standalone player commands covering every item/XP/skill, kick/ban/teleport, cleanup, progression, equipment, inventory-editing, and kick-all route. Examples include `/give-item`, `/add-player-xp`, `/kick-player`, `/ban-player`, `/teleport-player`, `/add-player-currency`, and `/repair-player-gear`. Player-scoped operations require the numeric Console `player-id`; disruptive operations also require `confirm:true`.

Options ending in `-json` accept the documented structured value as JSON: `items-json` and `augments-json` require arrays, while `values-json` requires an object. Routes with a fixed Console confirmation phrase supply it automatically; routes whose confirmation phrase is operation-specific expose a required `confirmation` option. All responses are ephemeral.

## Community FAQ panel

Set `FAQ_PANEL_CHANNEL_ID` to publish the persistent Crimson Skies FAQ and banner. On startup, the bot updates its existing FAQ message in place or creates it when missing, keeping one current panel in the configured channel.

## Architecture

The application is intentionally modular. `ArrakisClient` maps Sapphire's command, interaction-handler, listener, and precondition stores directly to the top-level directories under `src/`; there are no custom dynamic loaders. Client composition lives in `src/client/`, infrastructure clients own external I/O, domain behavior lives under `src/modules/`, and reusable primitives remain under `src/shared/`.

## Security notes

- Secrets are loaded from environment variables and excluded by `.gitignore`.
- Privileged actions validate authorization when executed; hiding a command or button is not the security boundary.
- Uploaded blueprint URLs are restricted to Discord CDN hosts and are size-checked before forwarding.
- External API errors are logged internally but reduced to safe user-facing messages.
- Automatic retries are limited to safe/idempotent Dune Console methods.
