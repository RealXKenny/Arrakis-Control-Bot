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
npm run typecheck                 # Type-check without emitting output
npm run lint                      # Run ESLint with type-aware rules
npm run audit:prod               # Check production dependencies (npm audit --omit=dev)
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
│   ├── community/{music,poker,voice}/
│   ├── economy/{leaderboard,market}/
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
│   ├── leaderboard/navigation/
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
│   ├── players/{administration,blueprints,directory,leaderboard,linking}/
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
scripts/updater/                           Update supervisor and verified updater (identical copy of the dashboard's)
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
- Use `registerApplicationCommand`; only the primary shard should synchronize global commands. The `entryPointGuard` listener wraps the global bulk overwrite with `support/commands/preserveEntryPointCommand.ts` so the Discord-created Activity Entry Point command is kept (Discord rejects an overwrite without it, error 50240); do not remove it while `/poker` uses Activities.
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

## Panel Visual Language

- Use `PANEL_COLORS` and helpers from `shared/discord/panelStyle.ts`; never hard-code hex accent colors in panels. Keep headings sentence-case, prefer neutral wording, and avoid themed emoji.
- Banners come from `createPanelBanner`/`createTicketSupportBanner` in `shared/discord/imageFactory.ts` over the backgrounds in `data/images/`. Regenerate those with `node scripts/generate-panel-artwork.mjs`, keeping filenames stable (the release workflow smoke-checks `panel-welcome.png`).
- When renaming a persistent panel heading, keep the old heading as a legacy marker in the panel's `matches` callback.

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

- Honeypot Status uses the exact `honeypot:status` button route and responds ephemerally after checking the bot author and configured guild/channel. Count distinct verified non-exempt members, deduplicate incidents by message ID, and separate successful sanctions from failures. Use the shared PostgreSQL pool for persistent statistics; label the optional in-memory fallback as counts since restart. Never let a statistics write failure prevent moderation.

- The honeypot warning panel uses Components V2 and existing rules artwork, states the configured consequence, and joins `persistentPanelTasks` for startup and owner refresh. Publish only on the shard hosting its guild and reuse the recognized bot message; suppress simultaneous publications.

- Honeypot moderation lives in `modules/moderation/honeypot/`, configuration in `infrastructure/config/honeypot.ts`, and the thin gateway adapter in `listeners/discord/honeypotMessages.ts`. It is opt-in for one exact guild/channel, defaults to ban, fetches current member roles, exempts owners/staff/moderators, and logs deletion and sanction outcomes separately. Keep its message-ID cache bounded, never shorten existing timeouts, and exclude trap messages from XP and music replies. See `guides/honeypot.md`.

- `/market` is read-only. Preserve decimal-string prices, convert its public one-based page to the API's zero-based page, and show lowest asking price plus configured Buyback guidance.
- `/leaderboard` is a public, read-only Solari ranking in `modules/players/leaderboard/`. It pages `/api/players` (zero-based API pages), reads `/api/players/{playerId}/solaris-coin` with bounded concurrency, keeps balances as decimal strings compared with `BigInt`, and caches one shared snapshot for five minutes. Unreadable balances are counted, never ranked. Controls use the `leaderboard-page:` prefix and are requester-bound for 15 minutes.
- `/help` catalogs every command once, uses public Components V2 output, binds controls to its requester, and expires sessions after 15 minutes.
- Persistent panels must update recognized bot messages idempotently, avoid duplicate publication, and recover safely from deleted or partially published messages. Route history-based publishers through `modules/panels/persistentPanel.ts` and the shared-pool `PanelRepository`. Require PostgreSQL, use stable per-channel panel keys (one per message for multipart panels), import existing bot-authored history once with the 10,000-message bound, and fetch saved IDs with `force: true`. Recreate only on Discord error 10008; database/permission/network failures must never trigger a fresh post. Music/storm legacy duplicate cleanup runs only during import. Retain the existing voice, ticket archive, and application-review database IDs.
- Server-information changes must preserve the complete supplied INI content and keep every message below the aggregate Components V2 display-text limit.
- With YouTube disabled, `/music stop` must clear the persisted current track and queue before fresh SoundCloud playback. Do not assume a source-prefix change makes old encoded tracks playable.
- Preserve the in-game bridge display name `Arrakis Control`; its required hexadecimal RabbitMQ identity is a separate protocol field.
- Community leveling uses a `250 × level²` cumulative curve and awards 8–25 base XP for meaningful messages using effort signals, with an atomic short anti-spam window and recent-message fingerprint protection. It awards 15 eligible voice XP per minute independently and ignores bots, webhooks, system messages, DMs, tiny messages, AFK voice, and deafened/suppressed voice members. Boosters receive 2× XP; active server events add another multiplicative 2× for 4× total. Only the highest earned milestone role is retained at levels 1, 10, 20, 30, 40, 50, 60, and 70, and all eight role IDs come from `LEVEL_ROLE_*_ID` environment settings.

- The suggestion assistant lives in `modules/community/suggestions/`, configuration in `infrastructure/config/suggestions.ts`, storage in `infrastructure/database/suggestions/SuggestionRepository.ts` (tables created by its idempotent initializer), and thin adapters in `listeners/discord/suggestion*.ts`, `commands/community/suggestions/` and `interaction-handlers/community/suggestions/`. It is opt-in through `SUGGESTIONS_FORUM_CHANNEL_ID`, requires PostgreSQL, and uses only local classical text analysis (keyword lexicon, TF-IDF similarity, extractive summaries, seeded phrase-bank replies): never add a paid AI API or model download. Status buttons use the `suggestion-status:` prefix, `suggestion-summary` and `suggestion-similar` are open to everyone, and the feature menu `suggestion-feature:<id>:<requester>` is requester-bound for 15 minutes. Staff access (owner, Manage Threads or configured staff roles) is checked at execution. Never remove a member's own category tags; keep applied tags at five or fewer; recreate a post's panel only on Discord error 10008. Status updates may mention only the suggester. The GitHub autopilot (`SuggestionAutopilot`, rules in `githubActivity.ts`, client `infrastructure/http/github/GitHubActivityClient.ts`) is read-only GET with ETags and rate-limit pauses, only moves statuses forward, never changes Back Burner, Not Doing or Implemented, acts on each work link once (`suggestion_work_links`) and caps moves per pass; never log `SUGGESTIONS_GITHUB_TOKEN`. Catch-up posts panels with no mentions. See `guides/suggestions.md`.

- The chatbot lives in `modules/community/chatbot/` (rules in `chatbotIntents.ts`, answers in `ChatBrain.ts`, knowledge in `chatbotKnowledge.ts`, Discord glue in `ChatbotService.ts`), configuration in `infrastructure/config/chatbot.ts`, taught answers in `infrastructure/database/chatbot/ChatbotRepository.ts` (table `chatbot_answers`, migration 3), and thin adapters in `listeners/discord/chatbotMessages.ts` and `commands/community/chatbot/chat.ts`. It is homemade: rule-based intents, the shared local TF-IDF search and phrase banks; never add an outside AI API or model download. Its live skills are read-only. FAQ answers are read from `buildFaqPanel()`, so keep FAQ text there. Access (`CHATBOT_ACCESS`, default staff) is checked on every message and at `/chat` execution; teaching is staff-only. It answers only direct @mentions or replies to its own plain answers, skips suggestion threads, the honeypot channel and the music request channel, and replies with `allowedMentions: { parse: [], repliedUser: false }`. See `guides/chatbot.md`.

- There is no in-bot web dashboard or HTTP listener; it was removed before the V2 launch. Do not add an HTTP listener without a separate security review.

- The bot serves only `ALLOWED_GUILD_IDS` (default `GUILD_ID`) and leaves other guilds on ready and `guildCreate` via `modules/administration/guildAllowlist.ts`, never when no allowed guild is present. `registerApplicationCommand` restricts every command to guild contexts and guild installs; keep it the only registration path.

- Bot/Dashboard release announcements require PostgreSQL and the dashboard changelog API configured by `DASHBOARD_URL`. `ReleaseAnnouncementRepository` uses the shared pool and channel locks; preserve legacy imports, durable repository/version receipts, deleted-message records and replay safety. Only fresh, complete snapshots may send or reset receipts; replay forces a fresh fetch. Dashboard snapshots can lag publication and must be synchronized after releases. No GitHub API fallback is permitted. Changelog posts use `allowedMentions: { parse: [] }` and never ping the announcements role. All changelog handling lives in `modules/changelog/`: `changelogProjects.ts` is the only product registry (dashboard project key, display name, label, receipt repository, accent), `changelogEntries.ts` reads the dashboard API, `changelogCard.ts` renders posts and recognizes old ones, and `changelogAnnouncements.ts` sends, refreshes and replays. Every post names its product in the heading and a product line. Unknown dashboard project keys are skipped until registered. Never rename an existing project's `name` or `repository`; they key the history import and receipts. The dashboard no longer posts changelogs to Discord itself. Discord send and receipt writes are not atomic. A forum `ANNOUNCEMENT_CHANNEL_ID` gets one post per release (receipt = starter message ID = thread ID) tagged by product and Major/Minor/Patch; missing tags are created by name, never duplicated, within the 20-tag limit. A text channel gets a short card plus a notes thread. Notes messages carry a `-# <Product> v<version> release notes, part i of n` label and never the release heading; `repairReleaseAnnouncements` runs once per start and only edits, completes or trims the bot's own notes parts, so it must stay idempotent and never send a second announcement.

- Interactions: a modal cannot follow a defer, so any lookup before `showModal` must run under `withDeadline(..., PRE_ACKNOWLEDGEMENT_DEADLINE_MS)` from `shared/async/withDeadline.ts` and fall back safely. Grouped-command authorization uses `resolveActingMember` (roles from the interaction payload), not a forced REST fetch. Expensive grouped actions get per-user cooldowns in `support/commands/commandCooldowns.ts`, keyed by legacy name.
- Upstream resilience lives in `infrastructure/http/resilience.ts`: Dune Console and Convoy calls go through a per-area circuit breaker and a concurrency limiter, and Dune GETs share identical in-flight requests. Pass `cacheTtlMs` only for read-only data that may be a few seconds old. Only network errors, 429 and 5xx count as upstream failures.
- Database: pools register an `error` listener so a PostgreSQL restart never crashes the process; startup storage setup retries with `retryWithBackoff`. Schema changes after V2 go into `infrastructure/database/migrations/migrations.ts` as a new, never-edited version; the runner holds an advisory lock and refuses a newer schema. Keep repository initializers idempotent.
- Runtime metrics come from `modules/system/RuntimeMonitor.ts`, fed by probes wired in `BotApplication`. It logs, optionally writes `HEALTH_FILE`, and opens no port.
- Canvas: encode dynamic cards with `encodePng` (thread pool) and cache static banners with `RenderCache` (`shared/discord/canvasEncoding.ts`).
- Operations, backups, the restore drill and rollback are in `guides/operations.md`. Load budgets are in `tests/load/`; `npm run test:load` runs the soak.

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
- `.github/workflows/ci.yml` verifies every pull request, merge-queue entry, and pushes to `main`, `v2`, and `release/*`, running typecheck, lint, test, audit, and actionlint behind the `verify` gate job. A successful push to `main` triggers `.github/workflows/release.yml`; an unprivileged validation job prepares the egg and checksummed source archive before a separate publishing job receives write permissions.
- A new stable package version and matching non-empty changelog section create a GitHub release containing the egg, source archive, SHA-256 checksum and a per-file `.manifest.json` (`scripts/build-release-manifest.mjs`). The workflow does not build or publish a bot-specific Docker image.
- Regenerate `pterodactyl/egg-arrakis-control-bot.json` with `node scripts/generate-pterodactyl-egg.mjs` when `.env.example` changes. The Node 24 egg installs a release into `/home/container` (a reinstall over an existing install changes nothing) and starts `scripts/updater/supervisor.mjs`, which runs `node dist/src/index.js` as its child and applies verified updates. `scripts/updater/` must stay byte-identical to the dashboard's `scripts/deployment/updater/`; product settings live in `package.json` `arrakisRelease`. The updater never writes files outside the release manifest and the generated `node_modules`/`dist`, and never overwrites local or unmanaged files. See `guides/automatic-updates.md`.
- Dune Console reads log through `infrastructure/http/dune-console/consoleOutageLog.ts`: DEBUG per failure, one WARN per sustained outage, one INFO on recovery; writes always warn and never retry. Do not add per-request WARN or ERROR logs for recoverable read failures.
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


## vexp - Context-Aware AI Coding <!-- vexp v3.3.8 -->

### Context strategy: call run_pipeline ONCE at task start
If the task already names the files/symbols to touch, skip run_pipeline. Otherwise one
`run_pipeline({ "task": "..." })` returns ranked pivot files with line ranges and
blast radius. Do NOT open files one by one to find your way around - every extra
tool call costs a turn. Call it again ONLY when the task moves to a new area.
`get_skeleton` for files to understand, not edit. `verify_done` before calling a
multi-file task complete, then RUN the tests it names.

### Query shape (do this)
Anchor the task on real identifiers (ClassName, functionName) or file paths:
`run_pipeline({ "task": "fix JWT expiry in AuthService.validateToken" })`

vexp runs entirely on this machine, index in `.vexp/`;
`run_pipeline` transmits nothing to any external service.
On `status: "degraded"` or 0 pivots the index is still building - use your own tools.
For literal string sweeps use your native search - do NOT route text sweeps through vexp.
Repo SOURCE only: logs, dist/, node_modules/ and files outside the repo are NOT indexed.
<!-- /vexp -->
