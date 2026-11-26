# Management dashboard (beta)

The bot can host the Discord-Dashboard V3 beta (`@acstane/core` 3.1.0-beta.2) as a management dashboard. It is off by default and has not been verified against live Discord OAuth, PostgreSQL, or a production reverse proxy.

## How it is mounted

- Only the primary shard (shard 0) starts the dashboard, after Discord login. Other shards never listen.
- The framework server is built in memory and never listens. A small Node.js HTTP listener receives every request and sends it through two layers:
  1. The bot's own OAuth, logout and guild-access routes (`/api/auth/discord`, `/api/auth/discord/callback`, `/api/auth/logout`, `/api/guilds/<id>/access`).
  2. An allowlisted gateway in front of the framework. It reads sessions from PostgreSQL, rechecks Manage Server (or ownership) on the shard that owns the guild for every guild request, and gives the framework a random grant that is valid for that single request only.
- The framework's own login, page builder, live stream, actions, metrics, health and OpenAPI routes are not reachable. OAuth codes, state, cookies and unexpected query strings never reach the framework.
- `/api/spaces` lists guilds the signed-in user manages across all shards. The list is a hint; each guild request repeats the fresh check, so revoked permissions take effect immediately.
- Settings are stored in PostgreSQL (`bot_dashboard_settings`). Every successful change is recorded in `bot_dashboard_audit` with the user and value; history older than 365 days is purged by the shared cleanup timer, together with expired sessions, OAuth transactions and rate-limit windows.
- Writes require the dashboard's own `Origin`, JSON bodies of at most 16 KiB, and a separate rate limit.

The settings definition (`src/modules/dashboard/dashboardSettings.ts`) is currently empty. Add an option only together with the bot code that reads it.

## Configuration

| Variable | Purpose |
| --- | --- |
| `MANAGEMENT_DASHBOARD_URL` | Public HTTPS origin, for example `https://dashboard.example.com`. Empty disables the dashboard. |
| `MANAGEMENT_DASHBOARD_HOST` | Listen address inside the container. Default `0.0.0.0`. |
| `MANAGEMENT_DASHBOARD_PORT` | Listen port. Default `3001`. Use an allocated port on Pterodactyl. |
| `MANAGEMENT_DASHBOARD_CLIENT_SECRET` | Discord application OAuth2 client secret. |
| `MANAGEMENT_DASHBOARD_RATE_LIMIT_SECRET` | At least 32 random characters, used to hash client addresses. |

`CLIENT_ID` and `DATABASE_URL` are also required. In the Discord developer portal, add `<MANAGEMENT_DASHBOARD_URL>/api/auth/discord/callback` as an OAuth2 redirect.

## Reverse proxy

The listener speaks plain HTTP and expects a TLS-terminating reverse proxy at exactly `MANAGEMENT_DASHBOARD_URL`. Cookies use the `__Host-` prefix and `Secure`, so sign-in does not work over plain HTTP. The listener ignores `Host` and forwarded headers and rate-limits by the connecting socket address, so behind a single proxy every client shares one per-address window; the global window still applies.

## Known limits before production

- The framework is a beta and `happy-dom` is overridden to 21.0.4, outside the upstream range, to clear production advisories. `@acstane/core` also installs `better-sqlite3`, a native module, although the bot does not use it.
- The bundled web app expects framework usernames and avatars; the bot stores only Discord user IDs, so these show as empty.
- Live OAuth, PostgreSQL behavior, proxy setup and the web app's settings pages need staged verification.
