# CLAUDE.md

Arrakis Control Bot: a production TypeScript Discord bot for Dune: Awakening communities. Node.js 24+, Sapphire Framework 5, Discord.js 14, PostgreSQL, Shoukaku/Lavalink, RabbitMQ, and several HTTPS integrations.

Domain-first design beneath Sapphire's required store roots: pieces stay thin, domain behavior lives in `modules/`, external I/O and persistence live in `infrastructure/`.

## Commands (PowerShell, from repo root)

```powershell
npm run dev            # one source shard with tsx
npm run dev:watch      # same, with restarts
npm run build          # clear dist and compile strict TypeScript
npm test               # clean build + full Vitest suite
npm test -- --run <f>  # focused test file
npm run typecheck
npm run lint           # type-aware ESLint
npm run audit:prod
git diff --check
```

Do not start the live bot for routine verification.

## Layout and layer rules

- `src/client/` composition, login, shutdown, shards. No domain rules.
- `src/commands/`, `src/interaction-handlers/`, `src/listeners/`, `src/preconditions/` are the four Sapphire store roots. Keep them thin: extract input, check access, delegate.
- `src/command-actions/` grouped subcommand definitions/actions.
- `src/modules/` domain logic, formatting, sessions, panels. Not Sapphire pieces.
- `src/infrastructure/` config, databases, HTTP/AMQP/audio clients. Never imports commands or handlers, never builds Discord responses.
- `src/support/` Sapphire/Discord glue. `src/shared/` small framework-neutral primitives.
- `tests/` mirrors source ownership. `dist/` is generated: never edit or commit.

Dependencies point inward; avoid cycles.

### Store rules

- No helper modules or barrel `index.ts` inside a store root (Sapphire treats them as pieces). Put reusable code in `modules/`, `support/`, or `shared/`.
- Piece names must be unique per store. Path pattern: `<store-root>/<domain>/<feature>/<piece>.ts`. Handler files end in `-button`, `-menu`, or `-modal`.
- Grouped commands (`backup`, `bot`, `moderation`, `player`, `server`, `update`) are adapters in `commands/groups/`. Add subcommands via `command-actions/` and `support/commands/groupedCommandCatalog.ts`, not new top-level commands.
- Use `registerApplicationCommand`; only the primary shard syncs global commands.
- When adding or moving pieces, update `tests/stores/`.

## Code style

- Strict TS; never weaken `strict`, `noUnusedLocals`, `noUnusedParameters`. Extensionless local imports (NodeNext). No `any`; narrow `unknown`. Early returns. No floating promises.
- Log via `scopedLogger` with the owning subsystem; no second `[SCOPE]` prefix in messages.
- Use `PANEL_COLORS` and helpers from `shared/discord/panelStyle.ts`; no hard-coded hex colors. Sentence-case headings, neutral wording, no themed emoji. Banners via `shared/discord/imageFactory.ts`.
- `Dev note:` easter eggs go only inside executable source beside real logic, never in file headers or non-code files. Selective, mixing restrained dad jokes with developer and Dune humor.
- Do not hand-edit `package-lock.json`; use npm.

## Discord interaction rules

- Acknowledge every interaction exactly once (`reply`, `deferReply`, `deferUpdate`, `showModal`) before slow I/O. Do not change public/ephemeral visibility silently.
- Components V2: set `MessageFlags.IsComponentsV2` on the payload that first supplies V2 components; do not mix with legacy content/embeds; the 4,000-char limit is aggregate across the message (use `shared/discord/discordLimits.ts`, split oversized panels).
- Use `allowedMentions: { parse: [] }` for generated/external text. Escape or truncate user-controlled values.
- Bind sessions to the requesting user, enforce expiry, handle stale controls safely.
- Custom IDs are stable contracts: register them in `support/interactions/componentCustomIds.ts` and test routing.
- Check authorization at execution time; hidden or disabled UI is not a security boundary.
- Persistent panels: update recognized bot messages idempotently via `modules/panels/persistentPanel.ts` and `PanelRepository`; require PostgreSQL; recreate only on Discord error 10008. When renaming a panel heading, keep the old one as a legacy marker in `matches`.

## Data, persistence, security

- HTTP transport only in `infrastructure/http/` clients; extend the typed Dune endpoint catalog, no ad hoc `fetch`. Validate response shapes; show safe failures.
- Keep PostgreSQL `BIGINT` values (prices, balances) as decimal strings; compare with `BigInt`. Convert one-based user pages to zero-based API pages explicitly.
- Retry only safe/idempotent operations. Parameterize SQL; migrations idempotent.
- Close owned resources (PostgreSQL, Discord, AMQP, audio, timers) on shutdown. Rate limiting is process-local.
- Config lives in `src/infrastructure/config/` and `.env.example`; fail clearly at startup. Production URLs must be HTTPS; never disable TLS verification.
- Never commit or log secrets (`.env`, tokens, keys, DB URLs). Use synthetic IDs in tests. Treat attachments, remote JSON, DB rows as untrusted.
- RabbitMQ publisher confirms prove broker acceptance only, not in-game delivery. Keep the in-game bridge display name `Arrakis Control`.

## Feature invariants

Detailed contracts are in `AGENTS.md`. Read the relevant section before touching:

- Honeypot moderation (`modules/moderation/honeypot/`, `guides/honeypot.md`)
- `/market` (read-only, decimal-string prices) and `/leaderboard` (Solari ranking, five-minute shared snapshot, `leaderboard-page:` controls)
- `/help` (catalogs every command once, requester-bound, 15-minute sessions)
- Community leveling (`250 × level²` curve, eight `LEVEL_ROLE_*_ID` roles)
- GitHub release announcements (PostgreSQL required, no mentions, token never persisted)
- Server-information panels (preserve full INI content, stay under aggregate limit)
- Music (`/music stop` clears persisted state when YouTube is disabled)

## Testing

- Add or update tests for every behavior change. Mirror source ownership under `tests/`.
- Unit-test parsing, validation, limits, authorization, redaction, pagination, and failure paths without live services. Mock only external boundaries.
- Components V2 panels: test component count and aggregate displayable text.
- Repository-wide changes need the full suite.

## Docs, git, release

- Update `README.md`, `.env.example`, `guides/`, `CHANGELOG.md`, and `AGENTS.md` when users, operators, config, architecture, or workflow are affected.
- Regenerate the egg with `node scripts/generate-pterodactyl-egg.mjs` when `.env.example` changes; regenerate panel art with `node scripts/generate-panel-artwork.mjs`.
- Check `git status` first; keep changes scoped; no destructive Git commands unless asked. Never commit, tag, push, release, or open a PR unless asked. Never create release tags manually.
- Releases are automatic from `main` when `package.json` has a new stable version and a matching non-empty `CHANGELOG.md` section.

## Definition of done

1. Behavior implemented at the correct layer.
2. Regression tests added or updated.
3. `npm run build`, `npm run lint`, and `npm test` pass.
4. `git diff --check` passes; no unrelated edits.
5. Docs/config examples updated if the operational contract changed.
6. Handoff states what changed, what was verified, and what still needs live verification (Discord, Dune, RabbitMQ, Lavalink, database, deployment).
