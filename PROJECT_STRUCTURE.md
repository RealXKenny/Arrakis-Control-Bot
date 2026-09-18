# Project Structure

Arrakis Control Bot uses domain-first organization beneath Sapphire's four required piece-store roots. Pieces remain thin framework adapters; business behavior belongs to domain modules, external I/O belongs to infrastructure, and reusable Sapphire glue belongs to support.

## Repository Layout

```text
src/
├── index.ts
├── client/
│   ├── ArrakisClient.ts
│   ├── BotApplication.ts
│   ├── logger.ts
│   └── shard.ts
├── commands/                              Sapphire Command store
│   ├── administration/operations/
│   ├── community/{music,voice}/
│   ├── economy/market/
│   ├── general/{help,information}/
│   ├── moderation/{members,messages}/
│   ├── players/
│   │   ├── actions/
│   │   ├── bulk/
│   │   ├── directory/
│   │   ├── equipment/
│   │   ├── inventory/
│   │   ├── items/
│   │   ├── progression/
│   │   └── reset/
│   ├── server/{backups,lifecycle,maintenance,monitoring,services}/
│   ├── updates/{game,runtime,stack}/
│   └── world/storms/
├── interaction-handlers/                  Sapphire InteractionHandler store
│   ├── community/{onboarding,roles}/
│   ├── help/navigation/
│   ├── market/navigation/
│   ├── players/{blueprints,linking}/
│   ├── system/fallbacks/
│   ├── tickets/{intake,reviews,workflow}/
│   └── voice/
├── listeners/                             Sapphire Listener store
│   ├── discord/
│   └── sapphire/
├── preconditions/                         Sapphire Precondition store
│   ├── access/
│   └── rate-limit/
├── modules/                               Business and application logic
│   ├── audit/
│   ├── community/{faq,onboarding,roles,rules,verification}/
│   ├── help/
│   ├── market/
│   ├── music/
│   ├── players/{administration,blueprints,directory,linking}/
│   ├── releases/
│   ├── server/{backups,information,operations,status}/
│   ├── tickets/
│   ├── updates/
│   ├── voice/
│   └── world/storms/
├── infrastructure/                        External drivers and persistence
│   ├── audio/
│   ├── config/
│   ├── database/{tickets,voice,music}/
│   ├── http/{convoy,discord-adapter,dune-console}/
│   └── rate-limit/
├── support/                               Sapphire and Discord framework glue
│   ├── access/
│   ├── commands/
│   └── interactions/
├── shared/                                Framework-neutral primitives
│   ├── actors/
│   ├── discord/
│   └── process/
└── types/
    └── discord.d.ts

tests/
├── client/
├── helpers/
├── infrastructure/{config,http,rate-limit}/
├── modules/
│   ├── community/{faq,onboarding}/
│   ├── help/
│   ├── market/
│   ├── music/
│   ├── players/{administration,directory}/
│   ├── releases/
│   ├── server/{backups,information,operations}/
│   ├── tickets/
│   ├── updates/
│   ├── voice/
│   └── world/storms/
├── shared/discord/
└── stores/
```

## Path Convention

Sapphire pieces follow this predictable shape:

```text
<store-root>/<domain>/<feature>/<piece>.ts
```

Examples:

- `commands/server/backups/create-backup.ts`
- `commands/players/inventory/delete-inventory-item.ts`
- `interaction-handlers/tickets/intake/ticket-create-modal.ts`
- `interaction-handlers/market/navigation/market-page-button.ts`

Handler filenames include their component role (`-button`, `-menu`, or `-modal`) while remaining grouped by domain. This keeps related feature behavior together without creating ambiguous Sapphire piece names.

## Layer Ownership

| Layer | Responsibility |
|---|---|
| `client/` | Client composition, dependency binding, login, and shard lifecycle. |
| `commands/` | Slash-command schemas, precondition declarations, input extraction, and delegation. |
| `interaction-handlers/` | Component matching, acknowledgment order, session ownership checks, and delegation. |
| `listeners/` | Discord gateway and Sapphire lifecycle event adapters. |
| `preconditions/` | Reusable command admission and authorization policies. |
| `modules/` | Domain validation, orchestration, formatting, sessions, and presentation behavior. |
| `infrastructure/` | HTTP transport, API catalogs, configuration, databases, and persistence drivers. |
| `support/` | Framework-specific factories, routing helpers, access helpers, and base pieces. |
| `shared/` | Small deterministic primitives that do not own domain or infrastructure behavior. |

Commands and handlers must not contain database queries, raw HTTP transport, durable state, or substantial domain rules. Infrastructure must not construct Discord responses. Modules may depend on infrastructure contracts and shared primitives, but should not depend on files beneath Sapphire piece-store roots.

## Sapphire Store Mapping

The store roots remain registered in `ArrakisClient`:

| Source root | Sapphire store |
|---|---|
| `src/commands/` | `commands` |
| `src/interaction-handlers/` | `interaction-handlers` |
| `src/listeners/` | `listeners` |
| `src/preconditions/` | `preconditions` |

Sapphire recursively discovers pieces below these roots. No domain directory needs its own registration. Avoid helper modules and barrel `index.ts` files inside store roots; place reusable code in `modules/`, `support/`, or `shared/`.

## Interaction Routing

Interaction handlers are domain-first. Component type is expressed by the filename and `InteractionHandlerTypes`, not by a global `buttons/`, `menus/`, or `modals/` directory.

Custom IDs remain stable API contracts. Moving or renaming a handler file must not silently change prefixes such as `help-page:`, `market-category:`, `ticket-claim:`, or `ticket-review:`. Register known exact IDs and prefixes in `support/interactions/componentCustomIds.ts` and cover them in routing tests.

## Adding a Feature

For a new world mechanic named `sandworm`:

```text
src/commands/world/sandworms/sandworm-status.ts
src/interaction-handlers/world/sandworms/sandworm-page-button.ts
src/modules/world/sandworms/sandwormService.ts
src/infrastructure/http/dune-console/DuneApi.ts
tests/modules/world/sandworms/sandwormService.test.ts
tests/stores/commands.test.ts
tests/stores/interactionHandlers.test.ts
tests/stores/routing.test.ts
```

The command and handler should only translate Discord input/output. Put mechanics and validation in the module, and extend the Dune Console driver only when new external I/O is required.

## Verification

Run the complete verification sequence after moving or adding pieces:

```powershell
npm run build
npm run lint
npm test
npm audit
git diff --check
```

The build clears `dist` before compiling. This prevents stale compiled pieces from being discovered after source moves. Store tests verify unique piece names and recursive discovery without a live Discord login.
