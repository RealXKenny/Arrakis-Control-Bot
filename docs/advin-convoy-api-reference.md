# Advin Convoy Customer API Reference

**Status:** Current | **Last Updated:** August 2026

Reference for the Advin Convoy customer API used by Arrakis Control.

**Base URL:** `https://vps.advinservers.com`

## Authentication

Create an API key in the Advin control panel and grant only the abilities required by the integration. Send it with every request:

```http
Authorization: Bearer YOUR_API_KEY
Accept: application/json
Content-Type: application/json
```

Keys are customer-scoped, revocable immediately, and may be restricted to configured IP groups. Never commit a key to source control. Arrakis Control reads it from `API_KEY`.

## API client configuration

```env
API_URL=https://vps.advinservers.com
API_KEY=replace_with_advin_api_key
```

The bot exposes the authenticated client as `client.convoyApi`. The `/servers` command requires the `servers.read` ability.

## Route catalog

All routes below are relative to the base URL and require authentication. The ability in parentheses is the minimum documented API-key ability.

### Account

| Method | Route                    | Ability      |
| ------ | ------------------------ | ------------ |
| GET    | `/api/client/audit-logs` | `audit.read` |

### Servers

| Method | Route                                                            | Ability           |
| ------ | ---------------------------------------------------------------- | ----------------- |
| GET    | `/api/client/servers`                                            | `servers.read`    |
| GET    | `/api/client/servers/{uuid}`                                     | `servers.read`    |
| GET    | `/api/client/servers/{server_uuid}/details`                      | `servers.read`    |
| GET    | `/api/client/servers/power-states`                               | `servers.read`    |
| GET    | `/api/client/servers/{server_uuid}/state`                        | `servers.read`    |
| PATCH  | `/api/client/servers/{server_uuid}/state`                        | `servers.power`   |
| POST   | `/api/client/servers/{server_uuid}/create-console-session`       | `servers.console` |
| GET    | `/api/client/servers/{server_uuid}/metrics/{type}/{period}`      | `servers.read`    |
| GET    | `/api/client/servers/{server_uuid}/metrics-data/{type}/{period}` | `servers.read`    |
| GET    | `/api/client/servers/{server_uuid}/audit-log`                    | `servers.read`    |

### Server settings, storage, and backups

| Method | Route                                                             | Ability                  |
| ------ | ----------------------------------------------------------------- | ------------------------ |
| POST   | `/api/client/servers/{server_uuid}/settings/rename`               | `servers.settings.write` |
| POST   | `/api/client/servers/{server_uuid}/settings/reinstall`            | `servers.settings.write` |
| DELETE | `/api/client/servers/{server_uuid}/install-failure`               | `servers.settings.write` |
| GET    | `/api/client/servers/{server_uuid}/settings/template-groups`      | `servers.settings.read`  |
| GET    | `/api/client/servers/{server_uuid}/settings/ssh-keys`             | `servers.settings.read`  |
| GET    | `/api/client/servers/{server_uuid}/settings/user-scripts`         | `servers.settings.read`  |
| GET    | `/api/client/servers/{server_uuid}/settings/hardware/boot-order`  | `servers.settings.read`  |
| PUT    | `/api/client/servers/{server_uuid}/settings/hardware/boot-order`  | `servers.settings.write` |
| GET    | `/api/client/servers/{server_uuid}/settings/hardware/options`     | `servers.settings.read`  |
| PATCH  | `/api/client/servers/{server_uuid}/settings/hardware/options`     | `servers.settings.write` |
| GET    | `/api/client/servers/{server_uuid}/settings/network`              | `servers.settings.read`  |
| PUT    | `/api/client/servers/{server_uuid}/settings/network`              | `servers.settings.write` |
| GET    | `/api/client/servers/{server_uuid}/backups`                       | `backups.read`           |
| GET    | `/api/client/servers/{server_uuid}/backups/schedule`              | `backups.read`           |
| POST   | `/api/client/servers/{server_uuid}/backups/schedule`              | `backups.write`          |
| POST   | `/api/client/servers/{server_uuid}/backups/{backup_uuid}/restore` | `backups.write`          |
| DELETE | `/api/client/servers/{server_uuid}/backups/{backup_uuid}`         | `backups.write`          |

### Addresses, firewall, and protection

The API also provides IP address allocation, reverse DNS, firewall groups and rules, NeoProtect settings/profiles/attacks, and server attachment operations. These routes are intentionally exposed through the generic `ConvoyClient.request(method, route, options)` until a bot command defines the required safety confirmations.

Common route families include:

```text
/api/client/ip-addresses
/api/client/ip-groups
/api/client/firewall-groups
/api/client/servers/{server_uuid}/firewall-groups
/api/client/servers/{server_uuid}/firewall/policy
/api/client/servers/{server_uuid}/rdns/{ipId}
/api/client/servers/{server_uuid}/neoprotect/ip/{ip}/settings
/api/client/servers/{server_uuid}/neoprotect/ip/{ip}/profiles
/api/client/servers/{server_uuid}/neoprotect/ip/{ip}/attacks
```

### SSH keys, scripts, and ISO images

| Method | Route                                         | Ability              |
| ------ | --------------------------------------------- | -------------------- |
| GET    | `/api/client/ssh-keys`                        | `ssh-keys.read`      |
| POST   | `/api/client/ssh-keys`                        | `ssh-keys.write`     |
| PATCH  | `/api/client/ssh-keys/{ssh_key_uuid}`         | `ssh-keys.write`     |
| DELETE | `/api/client/ssh-keys/{ssh_key_uuid}`         | `ssh-keys.write`     |
| GET    | `/api/client/user-scripts`                    | `user-scripts.read`  |
| POST   | `/api/client/user-scripts`                    | `user-scripts.write` |
| PATCH  | `/api/client/user-scripts/{user_script_uuid}` | `user-scripts.write` |
| DELETE | `/api/client/user-scripts/{user_script_uuid}` | `user-scripts.write` |
| GET    | `/api/client/isos`                            | `isos.read`          |
| POST   | `/api/client/isos`                            | `isos.write`         |
| POST   | `/api/client/isos/query-link`                 | `isos.read`          |
| DELETE | `/api/client/isos/{iso_uuid}`                 | `isos.write`         |
| GET    | `/api/client/servers/{server_uuid}/isos`      | `isos.read`          |

## Safety

Power, reinstall, firewall, address, and storage-write routes can interrupt or destroy infrastructure. Add explicit Discord authorization, confirmation buttons, and audit logging before exposing them as commands.

## Source implementation

The authenticated client is implemented in [`src/infrastructure/api/ConvoyClient.js`](../src/infrastructure/api/ConvoyClient.js). The current read-only command is [`/servers`](../src/app/commands/server/servers.js).
