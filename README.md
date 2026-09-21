# Arrakis Control Bot

Production-oriented TypeScript Sapphire Framework and Discord.js bot for Dune: Awakening community administration, player linking, moderation, server operations, panels, and external service integrations.

See [AGENTS.md](AGENTS.md) for the repository structure, ownership boundaries, development rules, and verification workflow. The Dune Console endpoint catalog is compiled directly into `src/infrastructure/http/dune-console/endpointCatalog.ts`, so production startup does not depend on external reference files.

Release history is tracked in [CHANGELOG.md](CHANGELOG.md). The current version is 1.10.9.

## Requirements

- Node.js 24 or newer
- A Discord bot token with the intents and permissions used by the configured commands
- A reachable Dune Console HTTPS endpoint and a scoped API key
- Optional Convoy and Discord Adapter credentials for their integrations
- PostgreSQL for support tickets, community levels, persistent join-to-create voice rooms, and music state

Copy `.env.example` to `.env` and fill in the required values. Never commit `.env` or credentials.

Required variables are `TOKEN`, `CONSOLE_URL`, and `CONSOLE_API_KEY`. Every Dune Console request sends `Authorization: Bearer <key>` and relies on the key's configured scopes; grant only the read/write namespaces needed by the bot features you enable. Password login, browser sessions, cookies, CSRF handling, and automatic reauthentication are not supported by the bot. Invalid or expired keys return HTTP 401, insufficient scopes return HTTP 403, and key rate limits return HTTP 429. `CLIENT_ID` enables global slash-command deployment. `GUILD_ID` is the shared server ID used by optional single-guild voice and music configuration; it does not limit global command deployment. Optional Convoy and Discord Adapter integrations require their corresponding API key/token.

The ticket system is enabled when `DATABASE_URL` is configured. On startup, the bot creates and upgrades its ticket table and indexes automatically. Set `TICKET_PANEL_CHANNEL_ID` to the channel where members open tickets and `TICKET_CATEGORY_ID` to the category that should contain private ticket channels. Set `TICKET_TRANSCRIPT_CHANNEL_ID` to receive one persistent archive container per ticket with both `.txt` and structured `.json` records; the transcript is always retained in PostgreSQL. `DATABASE_SSL=true` enables TLS for hosted PostgreSQL services. Ticket access is granted to the creator and any configured staff roles; members may have one active ticket per server. Configured staff can claim and release tickets, and the claimant is recorded as the handler. Other staff cannot close a claimed ticket until its handler releases it; closing an unclaimed ticket as staff automatically assigns the closer. The panel routes members through Account & Linking, Technical Support, Player Report, Guild & Community, Gameplay & Server, or General & Other. The selected category is stored with the full details, troubleshooting already attempted, and impact/urgency. When the Discord Adapter is available, linked Dune character identity and online status are recorded with the private ticket. Closing a ticket saves its conversation and attachment references, sends the creator a complete DM receipt with the transcript and review button, then deletes its Discord channel. Submitted ratings, resolution status, comments, and review timestamps are retained in PostgreSQL and update the original archive container and JSON record instead of creating a second message. Members who disable DMs cannot receive the receipt, but closure and database archival still complete.

Ticket transcripts require the Discord **Message Content Intent**. Enable it for the bot application in the Discord Developer Portal; the runtime now requests both `GuildMessages` and `MessageContent` gateway intents.

## Message archive and edit/delete logs

When `DATABASE_URL` is configured, every new guild message is archived in PostgreSQL with its author, channel, text, attachments, embeds, components, stickers, reply reference, flags, webhook identity, and Discord timestamps. Edits preserve before-and-after revisions, while deletions mark the stored message instead of removing its content. Individual edits, deletes, and bulk deletes are reported to `ACTIVITY_LOG_CHANNEL_ID`; generated log cards disable mentions and recover content from the database when Discord emits only a partial uncached message. Discord's message-delete event does not reliably include the person who performed the deletion, so the bot records the deleted message and its author without guessing the deletion actor.

## Staff applications

Configure `STAFF_APPLICATION_PANEL_CHANNEL_ID` and the private `STAFF_APPLICATION_REVIEW_CHANNEL_ID` together to enable the application system. Members complete a five-question Discord form; leadership receives a private review card with accept and deny controls. `STAFF_APPLICATION_REVIEWER_ROLE_ID` can grant review access in addition to the existing staff roles and server administrators. Optional pending and accepted roles are managed automatically, decisions are sent to the applicant by DM when possible, and `STAFF_APPLICATION_COOLDOWN_DAYS` controls reapplication timing. Applications and decisions are stored in PostgreSQL, so `DATABASE_URL` is required. See the [staff application setup guide](guides/staff-applications.md).

## Community leveling

Community leveling is enabled automatically when `DATABASE_URL` is configured; set `LEVELING_ENABLED=false` to turn it off. Meaningful guild messages earn a variable 8–25 base XP based on their length, vocabulary, attachments, and reply context. An atomic short anti-spam window and recent-message fingerprint check prevent rapid or repeated farming without imposing a one-minute reward lock. Members also earn 15 XP per minute in a non-AFK voice channel when at least two eligible human members are participating; bots and members who are self-deafened, server-deafened, or suppressed do not count. Message and voice protections are stored independently in PostgreSQL.

Level thresholds use a demanding `250 × level²` cumulative XP curve, so every promotion requires more activity than the last. The highest earned tier role is assigned automatically at milestone levels 1, 10, 20, 30, 40, 50, 60, and 70: **Arrakis Wanderer**, **Sietch Dweller**, **Desert Survivor**, **Sand Warrior**, **Spice Hunter**, **Fremen Initiate**, **Desert Master**, and **Chosen of Arrakis**. Create those roles in Discord, place their IDs in the eight `LEVEL_ROLE_*_ID` entries in `.env`, then restart the bot. An administrator with Manage Server can run `/level roles status` to inspect configuration, existence, and hierarchy. Keep all level roles below the bot's highest role and grant the bot Manage Roles.

Server boosters always earn 2× message and voice XP. Manage Server administrators can schedule a persistent server-wide 2× window with `/level event schedule duration-minutes:<15–10080> [starts-at:<ISO date/time>]`, inspect it with `/level event status`, and cancel it with `/level event stop`. Booster and event bonuses stack multiplicatively for 4× XP. The optional start time may be up to 30 days ahead; omitting it starts the event immediately.

Set `LEVEL_ANNOUNCEMENT_CHANNEL_ID` to the one server channel that should receive every progression celebration. Level-ups use original golden-ascension banner artwork and the message “The sands recognize you…” whether the final XP came from chat or voice. Achievements use their own custom artwork: copper spice trails for **King of Spam** at 100/500/2,000 rewarded messages, moonlit cyan resonance for **Voice of the Sietch** at 60/300/1,200 rewarded voice minutes, and a violet celestial path for **Path of the Kwisatz** at levels 5/25/50. Each track awards Bronze, Silver, and Gold once; unlocks are stored atomically so restarts and multiple shards cannot announce the same achievement twice.

Use `/level rank` to view the avatar-backed profile card with a member's tier, server rank, message/voice activity, current multiplier, progress, and XP. `/level leaderboard` uses its own night-desert artwork to render the server's top ten as a separate themed image with member avatars, tiers, levels, and XP. Leveling uses the existing Message Content and Voice States intents and creates or upgrades its tables automatically; no manual SQL is required.

## Discord ↔ game chat over RabbitMQ

See the [complete RabbitMQ ↔ Discord setup guide](guides/rabbitmq-discord.md) for remote-broker setup, TLS, authentication, database personas, seven-map routing and troubleshooting. The optional bridge supports one shared Discord channel or separate channels per map.

## Join-to-create voice rooms

Configure `DATABASE_URL`, restart the bot, then run `/voice setup join:<voice channel> category:<category> panel:<text channel>` with **Manage Server** permission. Members joining the trigger receive a personal voice room; controls work only for the creator while inside their own room. Ownership and setup survive restarts, and empty rooms are automatically removed.

See the [voice-room setup and control guide](guides/voice-rooms.md) for permissions, commands, panel controls, and recovery behavior.

## Lavalink music lounge

Set `DATABASE_URL` and the optional `LAVALINK_URL`, `LAVALINK_PASSWORD`, and music channel values from `.env.example` to enable a permanent music voice channel. `MUSIC_IDLE_PLAYLIST_URL` plays a separate waiting-music album whenever the request queue is empty; member requests take priority immediately and the idle rotation is never persisted as a user's song. The bot accepts Spotify, Apple Music, Deezer and traditional song links, and ranks searches for clean title/artist matches. The supplied LavaSrc profile searches Spotify metadata, mirrors playback through SoundCloud, and uses quality-focused encoding and buffering settings. The public panel and grouped `/music` commands provide queue controls, player-style progress and lyrics; queue checkpoints persist in PostgreSQL for restart recovery. See the [music setup guide](guides/music.md).

## Development

```powershell
npm install
npm run build
npm test
npm run lint
npm run dev
```

`npm run dev` runs one bot shard directly for the smallest local process tree. Use `npm run dev:watch` when automatic TypeScript restarts are useful. Stop either mode with `Ctrl+C` so the bot can close Discord and PostgreSQL cleanly.

Use `npm run env:migrate -- --check` to preview whether a production `.env` needs the current boxed layout, then run `npm run env:migrate` to apply it. The script creates a timestamped backup, preserves existing values without printing them, carries forward unknown custom keys, and adds new template settings safely.

`LOG_LEVEL` accepts `DEBUG`, `INFO`, `WARN`, `ERROR`, or `FATAL`. `TOTAL_SHARDS` accepts `auto` or a positive integer. `INTERACTION_COOLDOWN_MS` and `RATE_LIMIT_MAX_ENTRIES` configure the bounded process-local limiter. In production, integration URLs must use HTTPS.

Before starting a release, run the same checks used by CI/deployment:

```powershell
npm run build
npm run lint
npm test
npm audit --omit=dev
```

Pushes and pull requests targeting `main` run the `CI` GitHub Actions workflow. After a successful push to `main`, the `Release` workflow reads the stable semantic version from `package.json`. If its `v<version>` tag does not exist, the workflow requires a matching non-empty `## [<version>]` section in `CHANGELOG.md`, creates the tag at the exact CI-verified commit, and publishes an `Arrakis Control Bot <version>` GitHub release from those notes. Commits that do not bump the version safely skip release creation.

### Docker image for Pterodactyl

After CI succeeds on `main`, its container job publishes `ghcr.io/realxkenny/arrakis-control-bot:latest` and an immutable `:sha-<full commit SHA>` tag to GitHub Container Registry. The image uses Node.js 24, includes the compiled bot and artwork, and starts the shard manager. It does not bundle `.env`, certificates, or other local secrets.

For a custom Pterodactyl egg, set the Docker image to `ghcr.io/realxkenny/arrakis-control-bot:latest` and the startup command to `cd /opt/arrakis && node dist/src/index.js`. Pterodactyl normally mounts its server files at `/home/container`, so keep the application in `/opt/arrakis`; a startup command that runs from `/home/container` cannot find the compiled bot or artwork. Supply `TOKEN`, `CONSOLE_URL`, and `CONSOLE_API_KEY` as egg environment variables, plus the optional values you use from `.env.example`. Use one server instance for this bot deployment. If RabbitMQ needs a private CA, upload its public PEM to the server files and set `RABBITMQ_CA_FILE` to its absolute `/home/container/...` path.

Use the SHA tag to pin a deployment to a tested commit. To pull a public package, no registry credentials are needed. If the package is private, configure Pterodactyl's registry credentials with a token that has `read:packages`; package visibility is managed under the repository owner's GitHub Packages settings. Allow at least 15 seconds for graceful shutdown.

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
- Routine Discord gateway reconnects remain silent through five consecutive attempts. Attempt six emits one warning, and a recovery message is written only for an episode that crossed that threshold.

### Verified startup

The production start path was previously verified with configured live services. After moving to API-key-only Console authentication, run a deployment smoke test to confirm the configured key scopes, Discord readiness, and panel updates in the target environment.

## Troubleshooting

- Missing or blank `CONSOLE_API_KEY` fails startup before Discord login. `CONSOLE_PASSWORD` is no longer read.
- An API-key-authenticated request returning HTTP 403 usually means the key is valid but lacks the scope required by that command.
- The first command that reaches the Dune Console will expose an invalid key or missing scope through its safe API error response.
- `CLIENT_ID` remains optional configuration; Sapphire uses the authenticated application when synchronizing registered commands.
- Use `LOG_LEVEL=DEBUG` temporarily when diagnosing integration or interaction failures. Logs do not intentionally include tokens or authorization headers.

## Weekly Coriolis storm panel

Set `STORM_CHANNEL_ID` in `.env` to enable one persistent Coriolis storm panel with a Dune banner, clear status, start/end dates, and live Discord countdowns. Every minute, the bot reads `coriolisNextCycleAt` from `GET /api/map/markers`, uses it as the storm end, and calculates the start as exactly 24 hours earlier. It edits the same message when the cycle or storm phase changes, and recreates the panel if deleted.

The Console API key needs read access to the `map` namespace. The bot accepts an ISO timestamp, Unix seconds, or Unix milliseconds from the API. When the reported cycle expires, the scheduled panel displays an awaiting-next-cycle state until a new schedule arrives.

Users can also run `/storm` at any time to retrieve the current API-backed storm panel. This command works independently of `STORM_CHANNEL_ID`.

Grant View Channel, Read Message History, Send Messages, Attach Files, and Embed Links in the destination. On startup, history discovery reuses the oldest recognized bot storm panel and removes duplicate bot storm announcements. Other messages are preserved. Discovery is limited to 10,000 messages and fails without creating duplicates if that limit is exceeded. Failed reads/edits/sends retry on the next minute. Only shard 0 publishes; run one bot deployment to avoid races between separate deployments. No role or everyone mentions are sent. Restart after changing configuration. Leaving `STORM_CHANNEL_ID` unset disables the feature.

## CHOAM market command

Users can run `/market` to browse active CHOAM Exchange sell orders grouped by item and grade. Results show each item's lowest asking price, total stock, listing count, and a recommended listing price calculated from the Market Bot's saved buyback percentage. The interactive panel provides an All Categories/category menu and First, Previous, Next, and Last page buttons. Optional `search`, `category`, `seller`, and `page` arguments set the initial view; `seller` defaults to all sellers. Controls are bound to the requesting member and expire after 15 minutes.

The command reads `GET /api/exchange/items` through the configured Dune Console API key and never changes exchange rows. Ensure that key is permitted to read the exchange endpoint. If the game database does not support the exchange schema, the command reports the capability as unavailable.

## Interactive command help

Run `/help` to open the public Arrakis Command Center. It catalogs all 87 grouped commands across 14 practical categories, shows Everyone, Staff, and Owner access badges, and provides category and page controls bound to the requesting member. The optional `category` argument opens a specific section immediately; interactive sessions expire after 15 minutes.

## Owner server controls

Members with the configured `OWNER_ROLE_ID` can run `/server start`, `/server stop`, `/server restart`, `/server fix-network`, `/server cleanup-images`, `/server cleanup-build-cache`, `/server services`, and `/server restart-service service:<name>`. Each owner-only subcommand calls the matching Dune Console endpoint and responds ephemerally. `/server services` lists current service status and provides the names accepted by `/server restart-service`. Storage cleanup requests include the Console's exact required confirmation phrase. The Console API key must have permission to execute server operations.

Set `BOT_CONTROL_CHANNEL_ID` to a private staff channel to publish the persistent **Arrakis Control Center**. The Discord server owner and members with `OWNER_ROLE_ID` can inspect live bot health, update every persistent panel in place, reload command/component modules, resynchronize game chat, voice, leveling, and music controls, or restart every bot shard after confirmation. A panel refresh covers every configured guild voice panel plus both the music control and now-playing messages. Actions respond privately and are recorded in the configured activity log. Keep the channel hidden from regular members even though authorization is rechecked for every button press.

`/server restart` and `/server restart-service` accept an optional `immediate` flag. Normal requests respect the Console Restart Queue and report queued `202` responses; `immediate:true` sends `restartQueue=immediate` to bypass its countdown. Concurrency-conflict `409` responses are shown in the ephemeral error panel.

## Owner update controls

Owners can use `/update game check`, `/update game apply`, `/update runtime fix-steamcmd`, `/update stack check`, `/update stack apply`, `/update game auto-status`, `/update game configure-auto`, and `/update runtime repair`. `/update game check` accepts the optional `fresh` flag. `/update game configure-auto` requires all documented automatic-update fields and forwards its `confirmation` value to the Console. All update responses are ephemeral.

## Backup controls

`/backup list` remains the read-only overview for the backup list and automatic-backup status. Owners can use `/backup create`, `/backup restore`, `/backup download`, `/backup delete`, `/backup delete-all`, `/backup import`, and `/backup configure-auto` for the remaining Console backup operations. Restore and deletion commands require an explicit `confirm:true`; responses are ephemeral.

External imports require both the backup archive and its metadata as Discord attachments and are limited to 25 MB combined. Downloads are returned as ephemeral Discord attachments and are limited to 10 MB; larger archives must be retrieved directly through the Console.

## Owner player administration

Owners have 38 player administration subcommands covering every item/XP/skill, kick/ban/teleport, cleanup, progression, equipment, inventory-editing, and kick-all route. Examples include `/player items give-item`, `/player items add-xp`, `/player actions kick`, `/player actions ban`, `/player actions teleport`, `/player progression add-currency`, and `/player equipment repair-gear`. Player-scoped operations require the numeric Console `player-id`; disruptive operations also require `confirm:true`.

Options ending in `-json` accept the documented structured value as JSON: `items-json` and `augments-json` require arrays, while `values-json` requires an object. Routes with a fixed Console confirmation phrase supply it automatically; routes whose confirmation phrase is operation-specific expose a required `confirmation` option. All responses are ephemeral.

## Community FAQ panel

Set `FAQ_PANEL_CHANNEL_ID` to publish the persistent Crimson Skies FAQ and banner. On startup, the bot updates its existing FAQ message in place or creates it when missing, keeping one current panel in the configured channel.

## Architecture

The application is intentionally modular. `ArrakisClient` maps Sapphire's command, interaction-handler, listener, and precondition stores directly to the top-level directories under `src/`; there are no custom dynamic loaders. Client composition lives in `src/client/`, infrastructure clients own external I/O, domain behavior lives under `src/modules/`, and reusable primitives remain under `src/shared/`.

Every user-facing Discord panel uses cinematic artwork from `data/images/`. The shared renderer selects a typed panel-specific background, applies consistent aspect-cover cropping and text-safe shading, then layers dynamic server names, counts, statuses, release versions, member avatars, and accessibility descriptions without baking live data into the source image. Persistent panels retain their unique scenes, welcome and goodbye cards use member-specific avatar banners, and short-lived Components V2 responses automatically receive the `panel-temporary.png` field-console scene when they do not already provide art. Lyrics, voice-room information, and no-cover music cards also include dedicated image attachments. High-volume audit-log records intentionally remain compact and text-first.

## Security notes

- Secrets are loaded from environment variables and excluded by `.gitignore`.
- Privileged actions validate authorization when executed; hiding a command or button is not the security boundary.
- Uploaded blueprint URLs are restricted to Discord CDN hosts and are size-checked before forwarding.
- External API errors are logged internally but reduced to safe user-facing messages.
- Automatic retries are limited to safe/idempotent Dune Console methods.

See the [complete command migration table](guides/commands.md) for all command groups and their actions.

Use `/server-usage` for Convoy CPU, memory, network and disk graphs. See the [Convoy guide](guides/convoy.md).
