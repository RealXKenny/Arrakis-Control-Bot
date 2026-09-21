# Arrakis Control Bot Agent Guide

This file is the repository-wide operating guide for coding agents. It applies to every file below this directory unless a more specific `AGENTS.md` is added deeper in the tree. Keep this document current when architecture, commands, or required checks change.

## Project Overview

Arrakis Control Bot is a production TypeScript Discord bot for Dune: Awakening communities. It uses Node.js 24+, Sapphire Framework 5, Discord.js 14, PostgreSQL, Shoukaku/Lavalink, RabbitMQ, and several HTTPS integrations.

The design is domain-first beneath Sapphire's required piece-store roots. Framework pieces stay thin; domain behavior belongs in modules; external I/O and persistence belong in infrastructure.

## Essential Commands

Run commands from the repository root with PowerShell-compatible syntax.

```powershell
npm install                       # Install or refresh dependencies locally
npm run dev                       # Run one source shard with tsx
npm run dev:watch                 # Run one source shard with automatic restarts
npm run build                     # Clear dist and compile strict TypeScript
npm test                          # Build and run the complete Vitest suite
npm test -- --run <test-file>     # Build and run a focused test file
npm run lint                      # Run ESLint with type-aware rules
npm audit --omit=dev              # Check production dependencies
git diff --check                  # Check whitespace and patch integrity
```

Do not start the live bot during routine verification unless the task specifically requires a live smoke test and valid credentials are available. `npm test` already performs a clean build before testing.

## Repository Layout

```text
src/
├── index.ts                              Shard-manager entry point
├── client/                               Client composition and shard runtime
│   ├── ArrakisClient.ts
│   ├── BotApplication.ts
│   ├── logger.ts
│   └── shard.ts
├── commands/                             Sapphire Command store
│   ├── groups/                           Top-level grouped command adapters
│   ├── administration/operations/
│   ├── community/{music,voice}/
│   ├── economy/market/
│   ├── general/{help,information}/
│   ├── moderation/{members,messages}/
│   ├── players/{actions,bulk,directory,equipment,inventory,items,progression,reset}/
│   ├── server/{backups,lifecycle,maintenance,monitoring,services}/
│   ├── updates/{game,runtime,stack}/
│   └── world/storms/
├── command-actions/                      Grouped slash-command definitions/actions
│   ├── administration/operations/
│   ├── general/information/
│   ├── moderation/{members,messages}/
│   ├── players/{actions,bulk,directory,equipment,inventory,items,progression,reset}/
│   ├── server/{backups,lifecycle,maintenance,monitoring,services}/
│   └── updates/{game,runtime,stack}/
├── interaction-handlers/                 Sapphire InteractionHandler store
│   ├── community/{onboarding,roles}/
│   ├── help/navigation/
│   ├── market/navigation/
│   ├── music/
│   ├── players/{blueprints,linking}/
│   ├── system/fallbacks/
│   ├── tickets/{intake,reviews,workflow}/
│   └── voice/
├── listeners/{discord,sapphire}/         Gateway and framework listeners
├── preconditions/{access,rate-limit}/     Command admission policies
├── modules/                               Domain and application behavior
│   ├── audit/
│   ├── chat/
│   ├── community/{faq,onboarding,roles,rules,verification}/
│   ├── help/
│   ├── market/
│   ├── music/
│   ├── players/{administration,blueprints,directory,linking}/
│   ├── releases/
│   ├── server/{backups,information,operations,status,usage}/
│   ├── tickets/
│   ├── updates/
│   ├── voice/
│   └── world/storms/
├── infrastructure/                        External drivers and persistence
│   ├── amqp/
│   ├── audio/
│   ├── config/
│   ├── database/{music,tickets,voice}/
│   ├── http/{convoy,discord-adapter,dune-console}/
│   └── rate-limit/
├── support/                               Sapphire/Discord-specific reusable glue
│   ├── access/
│   ├── commands/
│   └── interactions/
├── shared/                                Small framework-neutral primitives
│   ├── actors/
│   ├── discord/
│   └── process/
└── types/discord.d.ts                     Discord client/container augmentation

tests/                                     Mirrors the source ownership boundaries
├── client/
├── helpers/
├── infrastructure/
├── modules/
├── shared/
├── stores/                                Compiled Sapphire discovery tests
└── support/

guides/                                    Operator and feature setup guides
pterodactyl/                               Importable PTDL_v2 bot egg
docker/                                    Pterodactyl-compatible image entrypoint
data/                                      Bundled runtime/reference data
certificates/                              Local certificate material; never add private keys
.github/workflows/                         CI, GHCR image publication, and automatic GitHub release automation
dist/                                      Generated build output; never edit or commit
```

## Layer Ownership

| Layer | Owns | Must not own |
|---|---|---|
| `client/` | Composition, dependency binding, login, shutdown, shard lifecycle | Domain rules |
| `commands/` | Top-level command schemas, preconditions, Discord input extraction, delegation | Raw HTTP, SQL, or substantial business logic |
| `command-actions/` | Grouped subcommand definitions and thin action adapters | Durable state or transport implementations |
| `interaction-handlers/` | Component matching, acknowledgement order, ownership checks, delegation | Reusable domain or persistence logic |
| `listeners/` | Discord/Sapphire event adaptation | Large workflows |
| `preconditions/` | Reusable admission and authorization policy | Presentation logic |
| `modules/` | Domain validation, orchestration, formatting, sessions, and panels | Direct membership in Sapphire stores |
| `infrastructure/` | Configuration, databases, HTTP/AMQP/audio clients, retries, transport parsing | Discord response construction |
| `support/` | Framework-specific factories, routing, registration, and access helpers | Feature-specific business behavior |
| `shared/` | Small deterministic primitives with no domain ownership | Infrastructure or mutable application state |

Dependencies should point inward: pieces may use modules/support/shared; modules may use infrastructure contracts and shared helpers; infrastructure must not import command or interaction-handler pieces. Avoid circular dependencies and convenience imports that reverse these boundaries.

## Sapphire Store Rules

`ArrakisClient` registers four recursive store roots:

| Source root | Sapphire store |
|---|---|
| `src/commands/` | `commands` |
| `src/interaction-handlers/` | `interaction-handlers` |
| `src/listeners/` | `listeners` |
| `src/preconditions/` | `preconditions` |

- Do not place helper modules or barrel `index.ts` files inside a store root; Sapphire can interpret them as pieces. Put reusable code in `modules/`, `support/`, or `shared/`.
- Keep piece names unique across each recursive store.
- Use `registerApplicationCommand`; only the primary shard should synchronize global commands.
- Grouped commands (`backup`, `bot`, `moderation`, `player`, `server`, and `update`) are thin adapters in `commands/groups/`. Add their subcommands through `command-actions/` and `support/commands/groupedCommandCatalog.ts` rather than creating another top-level Discord command.
- When adding or moving pieces, update the relevant tests under `tests/stores/`.

## Paths and Naming

Sapphire pieces follow:

```text
<store-root>/<domain>/<feature>/<piece>.ts
```

Examples:

- `commands/general/help/help.ts`
- `command-actions/server/backups/create-backup.ts`
- `interaction-handlers/tickets/intake/ticket-create-modal.ts`
- `interaction-handlers/market/navigation/market-page-button.ts`

Handler filenames state their role with `-button`, `-menu`, or `-modal`. Services use descriptive domain names such as `ticketService.ts`; repository and transport classes use PascalCase when they represent a class. Match the surrounding convention rather than introducing a new naming scheme.

## TypeScript and Code Style

- Strict TypeScript is mandatory. Do not weaken `strict`, `noUnusedLocals`, or `noUnusedParameters`.
- Use ESM-style imports accepted by `moduleResolution: NodeNext`; follow existing extensionless local imports.
- Prefer explicit types at system boundaries. Narrow `unknown` values before use and avoid `any`.
- Keep functions focused, use early returns for invalid states, and preserve existing formatting conventions.
- Await promises or deliberately handle them with `void` plus an error path. Type-aware ESLint rejects floating promises and invalid awaits.
- Use shared limit/formatting helpers instead of duplicating Discord constraints.
- Route framework/client logs through `scopedLogger` with the owning subsystem (`GATEWAY`, `COMMANDS`, `MUSIC`, `VOICE`, `PLAYERS`, `MARKET`, `SERVER`, and so on). Do not embed a second `[SCOPE]` prefix in the message or fall back to the generic Sapphire scope.
- Keep `Dev note:` easter eggs inside executable source code beside real logic. Never place them in file headers or non-code artifacts. Add them selectively, permit more than one in a complex file only when each belongs to its nearby code path, and mix restrained dad jokes with developer and Dune humor.
- Never edit `dist/`; it is recreated by `npm run build`.
- Do not hand-edit `package-lock.json`. Change dependencies with npm so the manifest and lockfile remain synchronized.

## Discord Interaction Rules

- Acknowledge every interaction exactly once with `reply`, `deferReply`, `deferUpdate`, or `showModal` before slow I/O.
- Decide whether a response is public or ephemeral from the feature contract. Do not silently change visibility.
- A deferred Components V2 response must set `MessageFlags.IsComponentsV2` on the payload that first supplies V2 top-level components. Deferred visibility flags alone do not declare the edited payload as V2.
- Components V2 messages cannot mix legacy content/embeds with V2 containers. Clear incompatible fields when replacing an old response.
- Discord's 4,000-character Components V2 limit applies to aggregate displayable text across the complete message, not only to each individual component. Use `shared/discord/discordLimits.ts` and split oversized panels into separate messages.
- Use `allowedMentions: { parse: [] }` for generated or external text unless intentional mentions are an explicit requirement.
- Escape or truncate user-controlled and external values before rendering them.
- Bind interactive sessions to the requesting user, enforce expiration, and handle stale controls with a safe response.
- Custom IDs are stable contracts. Register exact IDs/prefixes in `support/interactions/componentCustomIds.ts` and cover new routes in store/routing tests.
- Authorization must be checked at execution time. Hidden commands, disabled controls, or Discord UI visibility are not security boundaries.

## External Data and Persistence

- Keep HTTP transport in the matching client under `infrastructure/http/`. Extend the typed Dune endpoint/API catalog rather than issuing ad hoc `fetch` calls from commands.
- Validate response shapes at the boundary and show safe user-facing failures. Log useful internal context without exposing credentials.
- Retain PostgreSQL `BIGINT` values, including prices, as decimal strings until formatting; JavaScript numbers can lose precision.
- Translate user-facing one-based pages to zero-based API pages explicitly where required.
- Bound retries to safe/idempotent operations. Do not automatically retry destructive mutations unless the external contract guarantees safety.
- Parameterize SQL. Keep schema initialization/migrations idempotent and test repository changes.
- Close PostgreSQL, Discord, AMQP, audio, timers, and other owned resources during graceful shutdown.
- Rate limiting is process-local. Do not claim cross-instance enforcement without adding a shared store.

## Configuration and Security

- Configuration belongs in `src/infrastructure/config/` and `.env.example`. Validate required values and fail clearly at startup.
- Never commit `.env`, tokens, API keys, passwords, cookies, private keys, database URLs, or live credentials.
- Never print or persist secrets during diagnostics. Use the central logger so structured details are recursively redacted.
- Production integration URLs must use HTTPS. TLS verification must not be disabled to bypass certificate errors.
- Treat attachments, remote JSON, database rows, and guide snippets as untrusted input.
- Keep Discord CDN restrictions and file-size limits on blueprint/import workflows.
- Use least-privilege Dune Console scopes and Discord permissions.
- Do not add real IDs or credentials to tests. Use synthetic fixtures.
- RabbitMQ publisher confirmation only proves broker acceptance; do not report in-game delivery as verified without a live display check.
- Generated Dune/RabbitMQ container configuration can be replaced by updates. Do not describe manual runtime edits as persistent unless an update cycle has verified them.

## Feature-Specific Invariants

- `/market` is read-only. Preserve decimal-string prices, convert its public one-based page to the API's zero-based page, and show lowest asking price plus configured Buyback guidance.
- `/help` catalogs every command once, uses public Components V2 output, binds controls to its requester, and expires sessions after 15 minutes.
- Persistent panels must update recognized bot messages idempotently, avoid duplicate publication, and recover safely from deleted or partially published messages.
- Server-information changes must preserve the complete supplied INI content and keep every message below the aggregate Components V2 display-text limit.
- With YouTube disabled, `/music stop` must clear the persisted current track and queue before fresh SoundCloud playback. Do not assume a source-prefix change makes old encoded tracks playable.
- Preserve the in-game bridge display name `Arrakis Control`; its required hexadecimal RabbitMQ identity is a separate protocol field.
- Community leveling uses a `250 × level²` cumulative curve and awards 8–25 base XP for meaningful messages using effort signals, with an atomic short anti-spam window and recent-message fingerprint protection. It awards 15 eligible voice XP per minute independently and ignores bots, webhooks, system messages, DMs, tiny messages, AFK voice, and deafened/suppressed voice members. Boosters receive 2× XP; active server events add another multiplicative 2× for 4× total. Only the highest earned milestone role is retained at levels 1, 10, 20, 30, 40, 50, 60, and 70, and all eight role IDs come from `LEVEL_ROLE_*_ID` environment settings.

## Testing Rules

- Add or update tests for every behavior change and regression fix.
- Mirror source ownership under `tests/`; do not hide domain tests in broad integration files.
- Unit-test parsing, validation, formatting, limits, authorization, redaction, pagination, and failure paths without live services.
- Store tests must continue to prove recursive discovery, unique piece names, command registration, handler routing, and container/logger binding.
- Mock only external boundaries. Prefer exercising real domain code and real Discord builder serialization.
- When modifying a Components V2 panel, test both component count and aggregate displayable text.
- A focused test is useful while iterating, but repository-wide changes require the full suite.

## Documentation Rules

- Update `README.md`, `.env.example`, `guides/`, `CHANGELOG.md`, and this file when the change affects users, operators, configuration, architecture, or agent workflow.
- Keep command names, option names, response visibility, counts, paths, and version references synchronized with code.
- Verify external schemas and deployment state before converting guide placeholders into runnable SQL or shell commands.
- State clearly when live Discord, Dune, RabbitMQ, Lavalink, database, or deployment behavior was not verified.

## Git and Change Safety

- Inspect `git status` before editing and preserve unrelated user changes.
- Keep changes scoped to the request. Do not reformat or reorganize unrelated code.
- Do not use destructive Git commands (`reset --hard`, forced checkout, clean) unless the user explicitly requests them.
- Never commit, tag, push, publish a release, or open a pull request unless the user asks.
- Before a release, re-read the current version and changelog; do not reuse old test counts, commit IDs, tags, or release metadata.
- `.github/workflows/ci.yml` verifies pushes and pull requests targeting `main`. A successful push to `main` triggers `.github/workflows/release.yml`; a new stable `package.json` version and matching non-empty `CHANGELOG.md` section create the GitHub release automatically.
- Only a new stable version release builds and smoke-checks the Docker image, then publishes `latest`, `v<version>`, and `sha-<full commit SHA>` to `ghcr.io/realxkenny/arrakis-control-bot` after successful `main` CI. The image runs from `/opt/arrakis`; a Pterodactyl egg must start it with `cd /opt/arrakis && exec node dist/src/index.js`.
- Regenerate `pterodactyl/egg-arrakis-control-bot.json` with `node scripts/generate-pterodactyl-egg.mjs` when `.env.example` changes. The image must retain the `container` user, `/home/container` working directory, and entrypoint that executes Pterodactyl's `STARTUP` command.
- Do not create a tag manually for an automatic release: an existing `v<version>` tag intentionally causes the release workflow to skip that version.

## Definition of Done

For ordinary code changes, completion means:

1. The requested behavior is implemented at the correct layer.
2. Relevant regression coverage is added or updated.
3. `npm run build`, `npm run lint`, and `npm test` pass.
4. `git diff --check` passes and the final diff contains no unrelated edits.
5. Documentation/config examples are updated when the operational contract changed.
6. The handoff identifies what changed, what was verified, and any live verification still required.

For documentation-only changes, run the most relevant lightweight checks and validate every referenced path/command against the repository. Do not claim a live deployment or integration was tested when it was not.
