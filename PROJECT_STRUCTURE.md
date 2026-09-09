# Project Structure

This document describes where production behavior belongs in Arrakis Control Bot. The structure favors small ownership boundaries while preserving the existing Discord.js application layout.

```text
.
├── .env.example                 Runtime configuration template
├── README.md                    Setup, operation, deployment, and troubleshooting
├── PROJECT_STRUCTURE.md         This architecture and ownership guide
├── docs/                        External API reference material
├── package.json                 Scripts and dependency declarations
├── package-lock.json            Reproducible dependency resolution
├── tsconfig.json                Strict TypeScript configuration
├── eslint.config.mjs            ESLint configuration
├── src/
│   ├── index.ts                 Shard manager entrypoint and process lifecycle
│   ├── app/
│   │   ├── commands/            Slash-command definitions and execution logic
│   │   ├── components/          Buttons, modals, and select-menu handlers
│   │   └── events/              Discord gateway event modules
│   ├── infrastructure/
│   │   ├── api/                 Dune, Convoy, and Discord Adapter clients
│   │   ├── config/              Environment parsing and application limits
│   │   ├── core/                Bot composition, shard process, and logger
│   │   ├── database/            PostgreSQL repositories and schema setup
│   │   ├── loaders/             Dynamic command, component, and event loading
│   │   └── rateLimit/            Replaceable rate-limit storage and policy
│   ├── modules/
│   │   ├── audit/               Discord audit forwarding and audit messages
│   │   ├── formatters/           External data to Discord presentation mapping
│   │   ├── panels/               Persistent Discord panel publishing
│   │   ├── tickets/              Ticket lifecycle and channel orchestration
│   │   └── validators/           File and payload validation
│   ├── shared/
│   │   ├── constants/            Application constants and configured role options
│   │   ├── factories/            Discord response and image builders
│   │   └── utils/                Actor context, CAPTCHA, permissions, and lookups
│   └── types/                    Discord.js module augmentation and shared types
└── tests/                        Credential-free unit and integration-boundary tests
```

## Ownership Rules

### `src/app`

Owns Discord-specific interaction shapes and user-facing responses. Handlers must validate authorization and input at execution time, acknowledge interactions exactly once, and throw errors for the central interaction boundary to log and answer safely.

### `src/infrastructure`

Owns process lifecycle, configuration, logging, dynamic loading, rate-limit storage, and external network calls. API clients must enforce timeouts, validate status codes and response shapes, and never expose credentials in logs or returned user messages.

### `src/modules`

Owns reusable application behavior that is larger than one Discord handler, such as panel synchronization, audit forwarding, formatting, and file validation. Modules should accept narrow interfaces instead of reaching into environment variables or Discord globals unnecessarily.

### `src/shared`

Owns small reusable primitives with no application startup side effects. State held here must have explicit expiry and bounds. Shared state that must work across multiple processes belongs behind an infrastructure interface, such as `RateLimitStore`.

### `tests`

Tests should target application logic and infrastructure boundaries with mocks/stubs. Live Discord, Dune Console, Convoy, and Adapter credentials do not belong in tests or CI.

## Runtime Flow

1. `src/index.ts` validates environment configuration and starts the shard manager.
2. Each shard runs `src/infrastructure/core/shard.ts`.
3. `BotApplication` creates the typed Discord client, integrations, loaders, and lifecycle hooks.
4. Commands, components, and events are loaded from `src/app/`.
5. The `ready` event starts presence, panels, announcements, and audit forwarding. When configured, startup also initializes PostgreSQL ticket storage.
6. Shutdown clears scheduled jobs, closes PostgreSQL, destroys Discord connections, and exits within a bounded timeout. Dune Console API keys require no logout lifecycle.

## Adding Features

- Add a slash command under the appropriate `src/app/commands/` area.
- Add a button, modal, or select menu under its matching component directory.
- Put external HTTP calls in an existing or new typed client under `src/infrastructure/api/`.
- Put reusable business logic in `src/modules/` or `src/shared/`, depending on whether it is application-specific or generic.
- Add credential-free tests under `tests/`.
- Run `npm run build`, `npm run lint`, `npm test`, and `npm audit` before deployment.

## Future Distributed Storage

The current bot uses bounded in-memory rate-limit and CAPTCHA state. This is appropriate for the current single-process deployment. If multiple bot instances must share limits or state, implement a compatible shared infrastructure adapter rather than changing command handlers or Discord components.
