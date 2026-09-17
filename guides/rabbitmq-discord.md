# RabbitMQ ↔ Discord setup for Dune: Awakening

## Setup order and machines

This guide describes this bot's map-chat bridge with the [Red-Blink self-hosting stack](https://github.com/Red-Blink/dune-awakening-selfhost-docker). The working deployment used director image `2111270-0-shipping`. Game schemas and routing keys may change between releases; inspect them before applying SQL.

1. On the **game/RabbitMQ host**, identify the existing game broker, listener, authentication backend and map bindings.
2. In the **game PostgreSQL database**, create or verify the chat persona. This is not the bot's ticket database.
3. On the **RabbitMQ host**, configure the dedicated broker user and certificate trust.
4. On the **bot machine**, configure Discord permissions and `.env`, then build and restart the bot.
5. Fully restart the **game client** after persona changes and test both directions.

The bot initiates an outbound AMQP connection to the game broker. Do not install a separate empty RabbitMQ broker on the bot machine: the game clients and bot must use the same broker/vhost. No RabbitMQ management API credentials are used by this bridge.

## Inspect the existing game broker

Run these read-only commands on the Linux game host. Replace the container name if your installation uses another one.

```bash
docker exec dune-rmq-game rabbitmq-diagnostics listeners
docker port dune-rmq-game
docker exec dune-rmq-game rabbitmqctl list_exchanges -p / name type
docker exec dune-rmq-game rabbitmqctl list_bindings -p / source_name destination_name destination_kind routing_key
docker exec dune-rmq-game rabbitmqctl eval 'application:get_env(rabbit, auth_backends).'
docker exec dune-rmq-game rabbitmqctl eval 'application:get_env(rabbitmq_auth_backend_cache, cached_backend).'
```

Expect `chat.map` to exist as a direct exchange. Inspect bindings while someone is in the target map: player queues may only exist while connected. The map keys in this guide are the requested deployment configuration, not a claim that every game version uses identical names or PvP settings.

If a listener needs publishing, modify the hosting stack's persistent configuration. For example, `31982:5671` publishes container TLS port 5671 on host port 31982 **only if inspection confirms 5671 is the actual TLS listener**. Apply changes using the stack's normal deployment procedure. Do not replace its existing service definitions or expose the management UI to make AMQP work.

## Database preparation

The persona is a synthetic chat sender, not a Steam login. Its three identity values serve different purposes:

| Value | Example | Used by |
| --- | --- | --- |
| Hex/FLS ID | `5E121CE000000004` | RabbitMQ username, AMQP userId, account `user` |
| Funcom ID | `ArrakisControl#0001` | `CHAT_BRIDGE_FUNCOM_ID`, game sender lookup |
| Character name | `Arrakis Control` | Game display name |

Account IDs, player-state row IDs and actor IDs are numeric database identifiers, not interchangeable with that hex string. One persona can send to all configured maps; do not create seven copies of it.

### Inspect before creating anything

Back up the game database through your normal hosting procedure. Run this in its SQL editor:

```sql
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'dune'
  AND table_name IN ('encrypted_accounts', 'encrypted_player_state', 'actors')
ORDER BY table_name, ordinal_position;

SELECT id, "user", funcom_id, platform_id, platform_name
FROM dune.accounts
WHERE "user" = '5E121CE000000004'
   OR funcom_id = 'ArrakisControl#0001';

SELECT DISTINCT server_id
FROM dune.encrypted_player_state
WHERE server_id IS NOT NULL;

SELECT partition_id FROM dune.world_partition ORDER BY partition_id;
```

The inspected schema has encrypted account fields, `character_state = 'Active'` filtering in the player-state view, and numeric actor foreign keys. It does not use the generic `actors(actor_type, account_id)` or timestamp columns found in some external examples.

### New installation

Use [create-chat-persona.sql](sql/create-chat-persona.sql) as an editable template for this inspected schema. Set the unused hex ID, Funcom ID, display name, existing server ID, matching partition/map/dimension and three reserved actor IDs before execution. Coordinate actor ID allocation with the server operator; checking that an ID is unused today does not reserve it against future game allocation. Account and player-state row IDs use their database sequence defaults; if previous manual inserts left sequences behind, have the operator reconcile them before creation.

Run the whole transaction together. The template aborts on an existing persona, occupied actor IDs or missing server/partition. It supplies synthetic platform metadata and keeps the persona `Offline` with an `Active` character. SQL-only creation is specific to this schema and must be checked against future releases. The template was derived from the inspected schema and existing persona repair; it has not been executed against a fresh live game database.

If the persona already exists, skip creation. Inspect its lookup and fix only missing fields. [repair-arrakis-control-persona.sql](sql/repair-arrakis-control-persona.sql) preserves the earlier repair for account 57/state row 17 and its specific server ID. It is a deployment-specific reference, not an install script or something to rerun after a successful setup. It intentionally aborts if actor links already exist.

### Verify the actual game lookup

```sql
SELECT p.*
FROM dune.get_players_info(
    ARRAY[ROW('ByFuncomId', 'ArrakisControl#0001')::dune.playeridentifier]
) AS p;
```

Check `player_id` (controller actor ID), `character_name`, `fls_id`, `funcom_id`, `platform_id` and `platform_name`. A query returning a row does not by itself prove the game can display it. In the working setup, the last two fields were initially null. After filling them with `redblink-console` and `RedBlink Console` and restarting the game client, the user confirmed Discord messages appeared.

For that existing persona only, this fills missing platform values without replacing populated fields:

```sql
BEGIN;
UPDATE dune.encrypted_accounts
SET encrypted_platform_id = COALESCE(encrypted_platform_id, dune.encrypt_user_data('redblink-console')),
    platform_name = COALESCE(platform_name, 'RedBlink Console')
WHERE "user" = '5E121CE000000004'
  AND dune.decrypt_user_data(encrypted_funcom_id) = 'ArrakisControl#0001';

SELECT id, "user", funcom_id, platform_id, platform_name
FROM dune.accounts WHERE "user" = '5E121CE000000004';
COMMIT;
```

Use the game's configured encryption functions/session; do not write plaintext into encrypted columns or change encryption setup. Fully exit Dune to the desktop and reopen it after repairing the persona. Do not copy another player's actors or Steam ID, and do not invoke a character-deletion notification to try to refresh chat.

## RabbitMQ user and authentication backend

The commands below use the example persona hex ID; change it consistently if you chose another one.

```bash
docker exec dune-rmq-game rabbitmqctl list_users
docker exec -it dune-rmq-game rabbitmqctl add_user '5E121CE000000004'
docker exec -it dune-rmq-game rabbitmqctl authenticate_user '5E121CE000000004'
```

The interactive commands prompt for the password. Skip `add_user` for an existing user; use interactive `change_password` only when intentionally rotating its password. Enter the raw password here; URL encoding applies only to the bot connection URL.

An internal user can exist yet fail authentication if the broker only uses the game's HTTP backend. In this deployment, inspection returned `cache` backed by `http`. The persistent RabbitMQ configuration was extended to:

```ini
auth_backends.1 = cache
auth_cache.cached_backend = http
auth_backends.2 = internal
```

This retains game authentication first and adds an internal fallback. Apply this only when it matches the inspected configuration; preserve existing HTTP endpoint/cache settings. Edit the host-mounted or generated configuration source, not just an ephemeral container file. Restart the broker using the hosting stack during a maintenance window: this interrupts game messaging. Then recheck effective settings and authenticate the dedicated user. Backend ordering and per-vhost permissions are described in [RabbitMQ access control](https://www.rabbitmq.com/docs/access-control).

Grant the dedicated user access to this bridge's resources:

```bash
docker exec dune-rmq-game rabbitmqctl set_permissions -p / '5E121CE000000004' '^amq\.gen-.*$' '^(chat\.map|amq\.gen-.*)$' '^(chat\.map|amq\.gen-.*)$'
docker exec dune-rmq-game rabbitmqctl list_user_permissions '5E121CE000000004'
```

No administrator tag is required. These rules cover the current temporary queue and map exchange behavior; review them if that behavior changes.

## TLS certificate setup between machines

Inspect the public certificate paths in the broker's configuration:

```bash
docker exec dune-rmq-game sh -c 'grep -nE "^[[:space:]]*ssl_options\.(cacertfile|certfile)" /etc/rabbitmq/rabbitmq.conf'
docker exec dune-rmq-game cat /etc/rabbitmq/cert.pem
```

Adjust paths to the actual configuration. `certfile` is the server certificate; `cacertfile` is a CA bundle configured on the broker. The bot needs the trusted CA that issued the server certificate, which is not necessarily the same bundle used by the broker to validate clients. For an intentionally self-signed server certificate, that public certificate can be the explicit trust anchor. Never copy the private `keyfile` to the bot.

Transfer the appropriate public PEM certificate/chain to the bot host through a trusted channel and set `RABBITMQ_CA_FILE` to its local path. Inspect certificate subject alternative names with OpenSSL where available:

```bash
openssl x509 -in cert.pem -noout -subject -issuer -ext subjectAltName
```

Connect using a hostname covered by the certificate, or set `RABBITMQ_TLS_SERVERNAME` to the intended broker's certified DNS name when dialing another address. Do not disable TLS verification. This bot supports CA trust and username/password TLS connections; it does not expose client-certificate/key settings for deployments requiring mutual TLS. See [RabbitMQ TLS support](https://www.rabbitmq.com/docs/ssl).

## Bot and Discord configuration

Discord-to-game messages get an `[Owner]` label when the Discord sender holds `OWNER_ROLE_ID` in the source server. For example: `[Discord] [Owner] Kenny: hello`. The bridge checks the message member roles directly; no player link, verification, Discord Adapter or Console player-profile lookup is required for this label. Game-to-Discord messages show the game sender without an Owner tag.

The optional bridge connects directly from the bot machine to the game's RabbitMQ server. Each configured Discord channel sends human messages to its mapped game maps and receives their chat. Repeat a channel ID with different map keys to share one channel across maps. Discord messages appear through the registered game persona with `[Discord] Display Name: message` attribution. Incoming names use the sender's Funcom ID because the AMQP payload does not supply a reliable resolved character name.

Add these variables to the bot machine's `.env` (replace the example IDs, host and password):

```dotenv
RABBITMQ_URL=amqps://5E121CE000000004:URL_ENCODED_PASSWORD@rabbit.example.com:31982/%2F
CHAT_BRIDGE_FUNCOM_ID="ArrakisControl#0001"
CHAT_BRIDGE_ROUTES='[{"guildId":"123456789012345678","channelId":"234567890123456789","map":"HaggaBasin.0"},{"guildId":"123456789012345678","channelId":"234567890123456789","map":"Survival_1.dim_1"},{"guildId":"123456789012345678","channelId":"234567890123456789","map":"DeepDesert_1.0"},{"guildId":"123456789012345678","channelId":"234567890123456789","map":"DeepDesert_1.dim_1"},{"guildId":"123456789012345678","channelId":"234567890123456789","map":"SH_Arrakeen.0"},{"guildId":"123456789012345678","channelId":"234567890123456789","map":"SH_HarkoVillage.0"},{"guildId":"123456789012345678","channelId":"234567890123456789","map":"Survival_1.dim_0"}]'
# For a private CA, specify a PEM CA certificate file on the bot machine:
# RABBITMQ_CA_FILE=C:/certificates/rabbitmq-ca.pem
# If dialing an IP/different host, set the DNS identity expected in the certificate:
# RABBITMQ_TLS_SERVERNAME=dune-rmq-game
```

Use the RabbitMQ host's reachable DNS name or IP, not `localhost` or a Docker service name belonging to the other machine. The port must be the published **AMQP/AMQPS listener**, not the management web UI port. `31982` is the supplied guide's example; use your deployment's actual port. Use a DNS name matching the TLS certificate. The bridge verifies certificates and supports a private CA without disabling verification. Plain `amqp://` also works for a trusted private network/VPN with a plaintext AMQP listener; `amqps://` is recommended between machines. URL-encode special characters in credentials (`@` → `%40`, `#` → `%23`, `/` → `%2F`). `/%2F` selects the root virtual host.

Keep `CHAT_BRIDGE_FUNCOM_ID` quoted in `.env`: an unquoted `#` starts a dotenv comment and would remove the discriminator from the sender identity.

For native sender lookup, the persona must resolve through `dune.get_players_info`, including its controller ID, character name and platform metadata. On this deployment, populating `encrypted_platform_id` and `platform_name`, followed by a full game-client restart, resolved missing sender information. Keep `CHAT_BRIDGE_DISPLAY_NAME` unset for the verified native-name path; the optional explicit-name override is not a substitute for a valid persona.

`RABBITMQ_TLS_SERVERNAME` sets the expected certificate DNS identity and TLS SNI while keeping the connection address from `RABBITMQ_URL`. Set it only to the intended broker's certificate name; certificate-chain and name verification remain enabled.

On the RabbitMQ machine, publish the listener port from its container if applicable and allow inbound TCP to that port from the bot machine through the host/cloud firewall. Only an outbound connection is needed on the bot machine; the bot does not run an HTTP chat server. For example, test reachability from Windows with `Test-NetConnection rabbit.example.com -Port 31982`. A successful TCP test does not verify TLS or authentication.

Before enabling chat, register the external persona using the database preparation section below, with IDs appropriate to the actual deployment. The RabbitMQ username must be that persona's 16-character hex account ID, and `CHAT_BRIDGE_FUNCOM_ID` must be its matching Funcom ID. The bot does not create database identities or alter game tables. Game clients may discard messages when the persona is missing or mismatched.

The broker user needs access to the game's vhost, publishing and reading `chat.map`, and creating/binding/consuming its own generated `amq.gen-*` queue. RabbitMQ management administrator tags and HTTP management credentials are not needed. For a dedicated bridge user on vhost `/`, a starting resource-permission rule is:

```sh
rabbitmqctl set_permissions -p / "5E121CE000000004" '^amq\.gen-.*$' '^(chat\.map|amq\.gen-.*)$' '^(chat\.map|amq\.gen-.*)$'
```

The game's `chat.map` exchange must already exist. The bridge binds a separate temporary queue to the exact map keys; it does not consume player queues. It uses only `chat.map`; proximity forwarding is not supported. Verify that your game deployment publishes the desired map traffic through `chat.map`. Map keys are case-sensitive. The example includes all seven requested keys: `HaggaBasin.0`, `Survival_1.dim_1`, `DeepDesert_1.0`, `DeepDesert_1.dim_1`, `SH_Arrakeen.0`, `SH_HarkoVillage.0`, `Survival_1.dim_0`. These are configurable routing keys, not a fixed allowlist: add future maps in `CHAT_BRIDGE_ROUTES` and restart the bot. Verify exact keys against the live broker bindings; map names and dimensions can differ by deployment. Incoming Discord messages retain their source map label. Game messages are not rebroadcast into other game maps. A Discord channel can have multiple map routes; multiple channels can also share a map. Duplicate channel/map pairs are rejected. Each outgoing map publish has its own message ID and confirmation; a failed route does not prevent attempts to the remaining maps. The shard owning each configured guild starts that guild's routes. Run only one bot deployment.

Enable **Message Content Intent** in the Discord Developer Portal. Grant View Channel, Send Messages, and Read Message History in each mapped channel; members who can write there can send to game chat. Only new human text messages are relayed. Bots, webhooks, DMs, attachments-only messages and edits are ignored. Discord mentions are disabled for game messages. Echoes from the bridge persona and recent duplicate game message IDs are suppressed.

Restart the bot after configuration changes. Leave `RABBITMQ_URL` unset to disable chat. The bridge uses heartbeats, bounded queues and automatic reconnects with delays up to 30 seconds. It relays live chat: downtime can lose messages, failed Discord deliveries are discarded with a warning, and outgoing messages are not automatically retried because delivery may be uncertain. Broker confirmation means RabbitMQ accepted a message, not that a game client displayed it. Discord text plus attribution is limited to 2,000 characters; longer outbound messages get a failure reply and oversized incoming Discord output is truncated.

After enabling, send one message in the configured Discord channel and one in the corresponding game map. Check both directions and verify the Discord message appears only once. Local automated tests cover serialization, routing, filtering, reconnects and shutdown; a live game/broker smoke test is still required for your deployment. See the [amqplib API documentation](https://amqp-node.github.io/amqplib/channel_api.html) for connection and publisher-confirm behavior.

### Map reference

| Routing key supplied for this setup | Discord label |
| --- | --- |
| `HaggaBasin.0` | Hagga Basin |
| `Survival_1.dim_1` | Hagga Basin PvP |
| `DeepDesert_1.0` | Deep Desert PvP |
| `DeepDesert_1.dim_1` | Deep Desert PvE |
| `SH_Arrakeen.0` | Arrakeen |
| `SH_HarkoVillage.0` | Harko Village |
| `Survival_1.dim_0` | World Overmap |

Use actual broker bindings to resolve discrepancies with these labels. Configuring a key does not create a game map. Because the bridge has its own receive queue, a broker confirmation can occur even when no game player is subscribed to that map.

Discord displays readable labels such as `**[Hagga Basin] Player#1234:** hello`.
The labels affect presentation and delivery-failure replies only; `.env` routes,
AMQP publishing, queue bindings and duplicate detection keep the original keys.
Unknown future map keys are displayed unchanged until a label is added in
`src/modules/chat/mapChatLabel.ts`.

The configuration example shares one Discord channel across all seven maps. Replace both example Discord IDs with your server/channel IDs (enable Developer Mode in Discord to copy them). To separate maps, use a different `channelId` on each desired route. The parser accepts up to 100 unique channel/map pairs and keys of the form `Name.Dimension`, with letters, digits and underscores in each component. Arbitrary new keys following that format require only a configuration change; different future protocols may require code updates.

### Build and start

On the bot host, from the repository directory:

```powershell
npm ci
npm run build
npm start
```

For development, use `npm run dev` instead of the production start. Stop the previous instance first; two deployments can relay duplicates. The base bot still requires `TOKEN`, `CONSOLE_URL` and `CONSOLE_API_KEY`, as described in the [main README](../README.md). The RabbitMQ settings do not replace these values.

Verify startup logs list all configured routes and report that the map consumer is active. For each map with an online player, send a uniquely identifiable short Discord message, verify it in game, then send a game message and verify its map label in Discord. A partial-failure reply lists unconfirmed maps; some other maps may already have received the message, so avoid resending blindly.

## Troubleshooting by symptom

| Symptom | Check |
| --- | --- |
| No bridge startup logs | `RABBITMQ_URL` is set in the running process environment; restart after edits. |
| Connection refused or timeout | Remote address, published AMQP listener, firewall and container health. |
| Certificate not trusted | Correct issuing CA/public self-signed certificate and readable bot-local PEM path. |
| `ERR_TLS_CERT_ALTNAME_INVALID` | URL hostname or `RABBITMQ_TLS_SERVERNAME` matches the intended certificate identity. |
| Password rejected / denied by HTTP service | Raw password, URL escaping, effective cache/HTTP/internal backend order. |
| Access refused while binding/publishing | Vhost and configure/write/read permissions for `chat.map` and `amq.gen-*`. |
| Discord messages never reach publish | Correct channel/guild IDs, Message Content Intent and bot permissions; only new human text is relayed. |
| Game → Discord works, reverse fails | Inspect the game log for sender lookup errors; verify the persona via `get_players_info` and restart the game after repair. |
| Broker confirms but no player sees text | Confirm live player bindings and client logs; broker confirms do not acknowledge display. |
| Only one map fails | Verify that exact case-sensitive map key against bindings while a player is there. |
| Duplicate messages | Stop duplicate bot deployments; check whether multiple separate channels intentionally share the map. |

### Inspect the game client log

On the Windows game client, the usual path is:

```text
%LOCALAPPDATA%\DuneSandbox\Saved\Logs\DuneSandbox.log
```

```powershell
Select-String -Path "$env:LOCALAPPDATA\DuneSandbox\Saved\Logs\DuneSandbox.log" -Pattern 'LogChat|LogPlayerInfoSubsystem|Received RMQ Message' | Select-Object -Last 30
```

The failure resolved during setup was:

```text
Received RMQ Message (Type: text_chat)
GetPlayerInfos - Couldn't get some of the playerinfos
StoreMessageInternal | Failed getting sender info!
```

This distinguishes receipt from successful sender resolution. Inspect the database result, platform metadata and game restart before changing payload casing, IDs or routing.

For director logs, use a UTC interval that includes time after the test. For example, a message at `21:09:54.842Z` is outside a cutoff of `21:09:54Z`:

```bash
docker logs --since '2026-09-17T21:09:50Z' --until '2026-09-17T21:10:05Z' dune-director 2>&1 | tail -n 150
```

Replace those example timestamps with your test time. Routine server state output and population-declaration errors do not establish a cause for a player-info failure. Remove credentials or private content before sharing logs.

## Operation and upgrades

Full JSON diagnostics were removed after setup; normal logs include connection state, routes and concise broker-confirmation counts without message bodies. There is no current `CHAT_BRIDGE_DEBUG_JSON` setting.

Keep the working native-name configuration and persona when adding maps. Update `CHAT_BRIDGE_ROUTES`, restart the bot and test newly added destinations. When updating the hosting stack, verify bindings, TLS certificates, effective authentication configuration and the persona lookup again. Keep changes in persistent hosting configuration so container recreation does not erase them.

To disable the bridge, unset `RABBITMQ_URL` and restart the bot. The exclusive receive queue is temporary. Retain the persona unless you deliberately perform a separate database cleanup; do not delete shared game accounts or actor records to disable relaying.

The bot does not replay missed chat or guarantee game-client display. Tests cover the current serializer, map routing, partial failures, duplicate suppression and reconnect lifecycle; compatibility with future game protocol changes must be verified in game.
