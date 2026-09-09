# Project Structure

Arrakis Control Bot uses top-level Sapphire stores, a dedicated client composition layer, domain-oriented modules, and isolated infrastructure adapters. Sapphire owns discovery and routing; domain and infrastructure behavior remains independent of store layout.

## Repository Layout

```text
.
├── .env.example                         Runtime configuration template
├── README.md                            Setup, operation, and deployment guide
├── PROJECT_STRUCTURE.md                 Architecture and ownership guide
├── package.json                         Scripts and dependency declarations
├── package-lock.json                    Reproducible dependency resolution
├── tsconfig.json                        Strict TypeScript configuration
├── eslint.config.mjs                    Typed ESLint configuration
├── src/
│   ├── client/                          Sapphire client composition and lifecycle
│   │   ├── ArrakisClient.ts             SapphireClient subclass and store mappings
│   │   ├── BotApplication.ts            Service composition, DB bootstrap, and login
│   │   ├── logger.ts                    Process-level application logger
│   │   └── shard.ts                     Shard lifecycle and graceful shutdown
│   ├── commands/                        Top-level Sapphire Command store
│   │   ├── administration/              Administrative commands
│   │   ├── general/                     General Discord commands
│   │   ├── moderation/                  Staff moderation commands
│   │   ├── players/                     Dune player commands
│   │   └── server/                      Server and backup commands
│   ├── interaction-handlers/            Top-level InteractionHandler store
│   │   ├── buttons/                     Button handlers
│   │   ├── menus/                       Select-menu handlers
│   │   ├── modals/                      Modal-submit handlers
│   │   └── fallbacks/                   Unknown and expired-control handlers
│   ├── listeners/                       Top-level Sapphire Listener store
│   │   ├── client/                      Discord client and gateway listeners
│   │   └── framework/                   Sapphire denial and error listeners
│   ├── preconditions/                   Top-level Sapphire Precondition store
│   ├── support/                         Framework routing helpers and base pieces
│   ├── infrastructure/                  Low-level technical adapters and I/O drivers
│   │   ├── api/                         API clients and compiled endpoint catalog
│   │   ├── config/                      Environment, limits, and version parsing
│   │   ├── database/                    PostgreSQL repositories and schema setup
│   │   └── rateLimit/                   Replaceable rate-limit storage and policy
│   ├── modules/                         Reusable application and domain behavior
│   │   ├── audit/                       Audit messages and forwarding
│   │   ├── formatters/                  External-data presentation mapping
│   │   ├── panels/                      Persistent Discord panel orchestration
│   │   ├── tickets/                     Ticket lifecycle and channel orchestration
│   │   └── validators/                  Payload and file validation
│   ├── shared/                          Stateless shared primitives and utilities
│   │   ├── constants/                   Role configuration and constants
│   │   ├── factories/                   Discord response and image builders
│   │   └── utils/                       CAPTCHA, permissions, limits, and lookups
│   ├── types/                           TypeScript module augmentation
│   └── index.ts                         Shard manager entrypoint
└── tests/
    ├── client/                          Client composition and lifecycle tests
    ├── stores/                          Sapphire store and routing tests
    ├── infrastructure/                  Config, API, and state-adapter tests
    ├── modules/                         Domain module tests
    ├── shared/                          Shared utility tests
    └── helpers/                         Credential-free test harnesses
```

## Layer Ownership

| Layer | Responsibility |
|---|---|
| `src/client/` | Constructs `ArrakisClient`, binds services, initializes PostgreSQL, logs in to Discord, and owns shard lifecycle. |
| `src/commands/` | Defines slash-command registration, declarative preconditions, and command execution. |
| `src/interaction-handlers/` | Routes exact and prefixed component IDs and preserves component acknowledgment order. |
| `src/listeners/` | Handles Discord gateway events and Sapphire framework denial/error events. |
| `src/preconditions/` | Enforces reusable owner, staff, and rate-limit policies. |
| `src/support/` | Contains framework-specific bases and routing helpers shared by Sapphire pieces. |
| `src/infrastructure/` | Owns HTTP transport, the hardcoded Dune endpoint catalog, environment parsing, persistence, and replaceable state drivers. |
| `src/modules/` | Owns reusable Arrakis business behavior, including tickets, panels, audit forwarding, formatting, and validation. |
| `src/shared/` | Provides small reusable factories, constants, and utilities without startup side effects. |
| `tests/` | Verifies behavior and compiled Sapphire discovery without live credentials or a gateway connection. |

## Sapphire Store Mapping

`ArrakisClient` uses `src/` as its piece root and explicitly maps each top-level store:

| Source directory | Sapphire store | Piece type |
|---|---|---|
| `src/commands/` | `commands` | `Command` |
| `src/interaction-handlers/` | `interaction-handlers` | `InteractionHandler` |
| `src/listeners/` | `listeners` | `Listener` |
| `src/preconditions/` | `preconditions` | `Precondition` |

No custom dynamic loader layer is used. The subcommands plugin is registered before client construction, while existing application commands retain their flat invocation shapes.

## Runtime Sequences

### Startup

1. `src/index.ts` validates manager configuration and starts the Discord shard manager.
2. Each shard launches `src/client/shard.ts` and validates its runtime environment.
3. `BotApplication` constructs `ArrakisClient` and binds external adapters, repositories, channel configuration, audit services, and rate-limit state.
4. PostgreSQL ticket storage initializes before Discord login when `DATABASE_URL` is configured.
5. Sapphire discovers commands, interaction handlers, listeners, and preconditions from their top-level stores.
6. The client establishes the Discord gateway connection.
7. The ready listener starts presence rotation, panel synchronization, audit forwarding, and version announcements as isolated tasks.

### Interaction Handling

1. Discord delivers an interaction through the gateway.
2. Sapphire resolves the corresponding command or interaction handler.
3. Command preconditions evaluate rate limits and configured authorization policies.
4. The selected piece validates input and delegates reusable work to modules or infrastructure adapters.
5. The piece returns the existing Discord response payload.
6. Sapphire framework listeners handle denials and unexpected command, autocomplete, handler, parse, or listener errors.

Component handlers use exact or explicitly defined prefix matching. Unknown or expired custom IDs are delegated to typed fallback handlers. Ticket identifiers, acknowledgment order, user-facing messages, and domain state transitions must remain stable.

### Graceful Shutdown

1. The shard captures a process signal, parent-process exit, or fatal process event.
2. A duplicate-shutdown guard prevents concurrent cleanup.
3. Presence, audit, and announcement jobs are cancelled.
4. The Discord client and PostgreSQL pool are closed within the bounded shutdown window.
5. The shard exits with the appropriate status for its process supervisor.

## Extension Guidelines

- Add commands beneath the relevant `src/commands/` domain and register application commands through the shared overwrite policy.
- Add buttons, menus, modals, and fallbacks under `src/interaction-handlers/` with the correct `InteractionHandlerTypes` value.
- Add Discord listeners under `src/listeners/client/` and Sapphire lifecycle listeners under `src/listeners/framework/`.
- Add reusable command authorization or admission policies under `src/preconditions/` and declare them in command options.
- Keep framework-specific helper code in `src/support/`; do not move domain rules into store adapters.
- Add external HTTP clients under `src/infrastructure/api/` and construct them in `BotApplication`.
- Keep SQL and connection-pool behavior inside `src/infrastructure/database/`.
- Put reusable ticket, panel, audit, formatting, or validation behavior in `src/modules/`.
- Put deterministic, broadly reusable primitives in `src/shared/`.
- Mirror the owning production boundary under `tests/` and keep tests credential-free.

Run the complete verification sequence before merge or deployment:

```powershell
npm run build
npm run lint
npm test
npm audit
git diff --check
```

## Distributed State Roadmap

The current rate limiter and CAPTCHA state are bounded and process-local. A multi-instance deployment should introduce shared adapters without changing commands or interaction handlers.

1. Preserve the existing state contracts.
2. Implement Redis-backed adapters with atomic acquisition and explicit TTLs.
3. Namespace keys by environment, application, guild, user, and operation.
4. Select in-memory or distributed adapters in `BotApplication` through configuration.
5. Add shared contract tests for both implementations.
6. Coordinate scheduled jobs and command registration through leases, leader election, or a deployment-time job before running multiple active instances.

Static verification does not prove live connectivity. Deployment validation must separately confirm Discord readiness, PostgreSQL availability, external API scopes, and panel synchronization.
