<div align="center">
  <img src="data/images/panel-bot-info.png" alt="Arrakis Control bot information banner" width="640" />

# Arrakis Control Bot

[Overview](#overview) · [**Documentation**](#documentation) · [Features](#features) · [Screenshots](#screenshots) · [Quick start](#quick-start) · [Deployment](#production-deployment) · [Development](#development) · [Security](#security)

[![CI](https://github.com/RealXKenny/Arrakis-Control-Bot/actions/workflows/ci.yml/badge.svg)](https://github.com/RealXKenny/Arrakis-Control-Bot/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/RealXKenny/Arrakis-Control-Bot)](https://github.com/RealXKenny/Arrakis-Control-Bot/releases/latest)
[![Node.js 24+](https://img.shields.io/badge/node.js-24%2B-5FA04E)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![discord.js 14](https://img.shields.io/badge/discord.js-14-5865F2)](https://discord.js.org/)
</div>

## Overview

Arrakis Control Bot is a production TypeScript bot for one Dune: Awakening community. It links Discord members to their
in-game characters, runs support tickets, moderation and staff applications, publishes persistent panels, bridges game
chat over RabbitMQ, plays music through Lavalink, and gives owners server, backup, update and player administration
through the Dune Console API. It is the companion of the
[Arrakis Control Dashboard](https://github.com/RealXKenny/Arrakis-Control-Dashboard) and the only service that posts
both projects' changelogs to Discord.

Built on Sapphire Framework 5 and discord.js 14, with PostgreSQL for persistent features. Release history is in
[CHANGELOG.md](CHANGELOG.md); repository structure and contributor rules are in [AGENTS.md](AGENTS.md).

## Documentation

| I want to…                                         | Go to                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------ |
| Install on Pterodactyl                             | [Pterodactyl egg](guides/pterodactyl.md)                                       |
| Keep the bot updated safely                        | [Automatic updates](guides/automatic-updates.md)                               |
| Run, monitor, back up, upgrade and roll back       | [Operations runbook](guides/operations.md)                                     |
| Understand a feature and its settings              | [Feature reference](guides/features.md)                                        |
| Find a command                                     | [Command groups](guides/commands.md)                                           |
| Bridge Discord and game chat                       | [RabbitMQ ↔ Discord](guides/rabbitmq-discord.md)                               |
| Set up music, voice rooms or staff applications    | [Music](guides/music.md) · [Voice rooms](guides/voice-rooms.md) · [Staff applications](guides/staff-applications.md) |
| Set up the honeypot, Poker Activity or Convoy      | [Honeypot](guides/honeypot.md) · [Poker](guides/poker.md) · [Convoy](guides/convoy.md) |
| Post release notes to Discord                      | [Changelog synchronization](guides/changelog-synchronization.md)               |
| Manage a suggestions forum                         | [Suggestion assistant](guides/suggestions.md)                                  |
| Review security and scale                          | [Security audit](guides/security-audit.md) · [Single-guild scale plan](guides/single-guild-scale-plan.md) |

All guides are listed in [guides/README.md](guides/README.md).

## Features

### Server operations

- **Owner server controls:** start, stop, restart (respecting the Console restart queue), network fix, image and build
  cache cleanup, and per-service restarts, all ephemeral and checked at execution time.
- **Control center panel:** live bot health, in-place refresh of every persistent panel, module reloads and confirmed
  shard restarts in a private staff channel.
- **Backups and game updates:** list, create, restore, download, import and schedule Console backups; check and apply
  game and stack updates.
- **Player administration:** 38 owner subcommands for items, XP, skills, currency, equipment, kicks, bans and teleports,
  with explicit confirmation for disruptive actions.
- **Resilient Console client:** scoped API key, bounded responses, jittered retries for reads only, `Retry-After`
  support, a circuit breaker, request coalescing and outage-aware logging (one warning per outage, not per request).

### Community

- **Player linking and blueprints** through the Console's Discord adapter.
- **Support tickets** with categories, claiming, transcripts and review receipts.
- **Community leveling** with a `250 × level²` curve, eight milestone roles, voice XP, boosts, events and achievements.
- **Staff applications, self-assignable roles, verification, rules and FAQ panels.**
- **Join-to-create voice rooms** and a **Lavalink music lounge** with Spotify, Apple Music and Deezer links.
- **Game chat bridge** between Discord and up to seven maps over RabbitMQ with verified TLS.
- **Weekly Coriolis storm panel**, **Solari leaderboard** and read-only **CHOAM market** browser.
- **Poker Activity:** `/poker` launches the dashboard's play-money Hold'em table inside Discord.
- **Release announcements** for the bot and the dashboard, bot first, from the dashboard's changelog API.
- **Suggestion forum assistant:** tags new suggestions, replies to the suggester, finds similar posts, summarizes
  long discussions and gives staff a status panel (Planned, Working on it, Back burner, Not doing, Added) in every post.
  Runs locally with no paid AI service.

### Moderation and records

- **Honeypot channels** that ban, time out or only log spam bots, with a warning panel and status counters.
- **Message archive** with edit history, deletions and bulk-delete logs to an activity channel.
- **Audit log forwarding** and Convoy resource graphs.

Every feature's configuration and limits are in the [feature reference](guides/features.md).

## Screenshots

The images below are the bot's real panel artwork from `data/images/`, regenerated with
`node scripts/generate-panel-artwork.mjs`. Live data (server names, counts, avatars) is layered on top at runtime.

| <img src="data/images/panel-server-status.png" alt="Server status panel artwork" /> | <img src="data/images/panel-tickets.png" alt="Support tickets panel artwork" /> |
| --- | --- |
| Server status | Support tickets |
| <img src="data/images/panel-market.png" alt="CHOAM market panel artwork" /> | <img src="data/images/level-up-banner.png" alt="Level-up banner artwork" /> |
| CHOAM market | Level-up banner |

Screenshots of the panels as they appear in a Discord server with live data have not been captured yet; they need a
running bot in a test guild.

## Technology stack

| Area           | Technology                                                 |
| -------------- | ---------------------------------------------------------- |
| Runtime        | Node.js 24, TypeScript (strict), ES modules via NodeNext   |
| Discord        | Sapphire Framework 5, discord.js 14, Components V2 panels  |
| Persistence    | PostgreSQL (`pg`)                                          |
| Integrations   | Dune Console API, Discord adapter, Convoy, RabbitMQ (`amqplib`), Lavalink (`shoukaku`) |
| Images         | `canvas` with generated panel artwork                      |
| Tests and lint | Vitest, ESLint (type-aware)                                |

## Architecture

```text
src/client/                 composition, login, shard manager, shutdown
src/commands/ …listeners/   Sapphire store roots: thin adapters only
src/command-actions/        grouped subcommand definitions
src/modules/                domain behaviour, formatting, sessions, panels
src/infrastructure/         config, PostgreSQL, HTTP/AMQP/audio clients
src/support/, src/shared/   Discord glue and framework-neutral primitives
scripts/updater/            Pterodactyl update supervisor (shared with the dashboard)
```

Dependencies point inward; [AGENTS.md](AGENTS.md) is the authoritative map and rule set.

## Quick start

Requirements: Node.js 24+, a Discord application with the bot user and the Server Members and Message Content
intents, a reachable Dune Console HTTPS endpoint with a scoped API key, and PostgreSQL for persistent features.

```powershell
npm ci
Copy-Item .env.example .env   # then fill in TOKEN, CONSOLE_URL and CONSOLE_API_KEY
npm run build
npm start
```

Required variables are `TOKEN`, `CONSOLE_URL` and `CONSOLE_API_KEY`. Every Console request sends
`Authorization: Bearer <key>` and relies on the key's scopes, so grant only the namespaces the features you enable
need. Invalid keys return HTTP 401, missing scopes 403 and rate limits 429. `CLIENT_ID` enables global command
deployment; `GUILD_ID` is the server the bot serves. Never commit `.env` or credentials.

Ticket transcripts and the message archive need the **Message Content Intent** enabled in the Discord Developer Portal.

## Configuration

`.env.example` documents every setting in numbered sections. Use `npm run env:migrate -- --check` to see whether an
existing `.env` needs the current layout, then `npm run env:migrate` to apply it with a timestamped backup; values are
never printed and unknown custom keys are kept.

Commonly tuned settings: `LOG_LEVEL` (`DEBUG` to `FATAL`), `TOTAL_SHARDS` (keep `1` for one server),
`CONSOLE_TIMEOUT_MS` (Console request timeout, default 30000), the `DATABASE_*` pool and timeout settings,
`MESSAGE_ARCHIVE_RETENTION_DAYS`, `RUNTIME_METRICS_INTERVAL_SECONDS` and `HEALTH_FILE`. Production integration URLs
must use HTTPS.

## Production deployment

### Pterodactyl

1. Download `egg-arrakis-control-bot.json` from the
   [latest release](https://github.com/RealXKenny/Arrakis-Control-Bot/releases/latest) and import it into a nest.
2. Create a server with the Node.js 24 image and have a panel administrator enter the hidden credentials.
3. Install and start. The installer verifies the release checksum, checks the archive, and builds as an unprivileged user.

From then on the update supervisor installs verified releases at startup and on a schedule, never overwrites a file you
changed or added (`.env`, certificates, custom folders), and rolls back a version that does not start. Pin a version
with `RELEASE_TAG`, choose `stable` or `prerelease`, set a maintenance window, or switch updates off. See
[automatic updates](guides/automatic-updates.md), including the one-time migration for servers created from an older
egg, and the [Pterodactyl guide](guides/pterodactyl.md).

### Node.js under a process manager

`npm start` runs the shard manager plus shard child processes; `npm run start:single` runs one shard directly. Both
exit if their parent disappears. `SIGINT` and `SIGTERM` trigger a bounded graceful shutdown (scheduled tasks, PostgreSQL
pool, Discord client).

- Restart on non-zero exit, and run exactly one manager per deployment.
- Pass secrets through the process manager's configuration facility.
- Forward `SIGTERM` and allow at least 15 seconds for shutdown.
- Alert on `FATAL`, shard death or repeated startup failures. Gateway reconnects stay silent for five attempts; the
  sixth warns once and recovery is logged once.

Rate limiting is process-local, which fits one process per shard. See the [operations runbook](guides/operations.md)
for health signals, backups, upgrades and rollbacks.

## Security

- The bot serves only the servers in `ALLOWED_GUILD_IDS` (default `GUILD_ID`) and leaves any other server.
- Authorization is checked when an action runs; a hidden command or button is not a security boundary.
- Secrets come from the environment and are never logged; Pterodactyl hides credential variables from panel users.
- Uploaded blueprint URLs are restricted to Discord CDN hosts and size-checked before forwarding.
- External API errors are logged internally and shown as safe messages; only safe, idempotent Console reads retry.
- Generated and external text is sent with mentions disabled.

See the [security audit](guides/security-audit.md).

## Development

```powershell
npm ci
npm run dev          # one source shard with tsx; npm run dev:watch restarts on changes
npm run build
npm run lint
npm test             # clean build plus the full Vitest suite
npm run test:load    # 30-second soak with latency budgets (also run in CI)
npm audit --omit=dev
```

Stop `npm run dev` with `Ctrl+C` so Discord and PostgreSQL close cleanly. Pull requests and pushes to `main`, `v2` and
`release/*` run CI. After a successful push to `main`, the release workflow publishes a GitHub Release only when
`package.json` carries a new stable version with a matching `CHANGELOG.md` section; it attaches the checksummed source
archive, a per-file manifest and the generated Pterodactyl egg (`node scripts/generate-pterodactyl-egg.mjs`).

## Troubleshooting

- A missing or blank `CONSOLE_API_KEY` stops startup before Discord login.
- HTTP 403 from a command usually means the key lacks that command's scope.
- `LOG_LEVEL=DEBUG` shows individual Console retries and failures plus stack traces; tokens and authorization headers
  are never logged.
- "Dune Console unavailable" is logged once per outage, with a short summary at most every ten minutes and one
  "recovered" line; individual failures are at DEBUG.

## Roadmap

Approved plans for both projects appear on the dashboard's public roadmap page. Stability work for one busy guild is
tracked in the [single-guild scale plan](guides/single-guild-scale-plan.md).
