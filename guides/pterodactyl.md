# Pterodactyl egg

Import [`pterodactyl/egg-arrakis-control-bot.json`](../pterodactyl/egg-arrakis-control-bot.json) into a Pterodactyl nest. This PTDL_v2 egg downloads a published bot source archive, verifies its SHA-256 checksum, and builds it with Node.js 24.

## Create the server

1. In the Pterodactyl admin panel, open **Nests**, select a nest, and import the egg JSON. Select the **Node.js 24** runtime when creating a server.
2. Give the server a memory limit and one allocation as required by your panel. The bot does not listen for incoming game traffic, so it does not use the allocation's port.
3. Enter `TOKEN`, `CONSOLE_URL`, and `CONSOLE_API_KEY`. The egg leaves them empty so no sample credentials are installed. Set other variables for the features you use. The egg exposes every variable in `.env.example`; leave optional values blank to disable their associated integrations.
4. Install the server and start it. The startup command is `cd /home/container && exec node scripts/updater/supervisor.mjs`. The supervisor checks for a verified update (see [automatic updates](automatic-updates.md)), then starts `node dist/src/index.js` as its only child and forwards the panel's stop signal to it. The panel marks startup complete after a Discord shard reports ready.

New releases install themselves: the supervisor checks at startup and every `AUTO_UPDATE_INTERVAL_HOURS`, verifies and builds the release in a staging folder, and only then stops the bot briefly to install it. Files you changed or added (`.env`, certificates, custom folders) are never overwritten; a conflicting update is skipped and each conflicting path is logged. Set `RELEASE_TAG` to a version such as `v2.1.0` to stay on it, or `AUTO_UPDATE_ENABLED=false` to update by hand. Take a database backup before major versions: releases with database migrations cannot be rolled back by the updater alone (see [automatic updates](automatic-updates.md#database-migrations)).

**Reinstall** over an installation that already has the updater changes no file. Over a 2.0.0 installation it adds only the updater files and `.arrakis/bootstrap.json`, so the updater can take over. Releases without a checksum are rejected unless an operator explicitly sets `ALLOW_UNVERIFIED_RELEASE=true` for an older release on a fresh install. The bot-specific GHCR image is no longer published; existing image-based servers must import the new egg and migrate their configuration. Servers created from an older egg follow [migrating an existing server](automatic-updates.md#migrating-an-existing-server).

## Integrations and secrets

- For releases with honeypot support, re-import the updated egg to expose `HONEYPOT_CHANNEL_ID`, `HONEYPOT_LOG_CHANNEL_ID`, `HONEYPOT_ACTION`, and `HONEYPOT_TIMEOUT_MINUTES`. Configure the trap and private log channels as described in [the honeypot guide](honeypot.md). Leave both channel IDs empty to disable it. The default action is an automatic ban.

- `CONSOLE_URL` must be HTTPS in production. Use externally reachable hostnames for the Console, PostgreSQL, RabbitMQ, and Lavalink services; `localhost` inside the bot container means the bot container itself.
- `DATABASE_URL` enables persistent features such as tickets, community levels, and music state. Set `DATABASE_SSL=true` when your PostgreSQL service requires TLS; certificates are verified unless `DATABASE_SSL_VERIFY=false`.
- The source archive includes this repository's public RabbitMQ server certificates under `/home/container/certificates/`. Set `RABBITMQ_CA_FILE` to the matching absolute path when trusting one of those brokers. For another broker or a rotated certificate, upload its trusted public CA PEM and set `RABBITMQ_CA_FILE` to that file, such as `/home/container/rabbitmq-ca.pem`. Do not upload a private key.
- Credential variables (`TOKEN`, `CONSOLE_API_KEY`, `ADAPTER_TOKEN`, `API_KEY`, `DATABASE_URL`, `RABBITMQ_URL`, `LAVALINK_PASSWORD`, `AUTO_UPDATE_GITHUB_TOKEN`) are hidden from the server owner and subusers; a panel administrator enters them under **Admin → Servers → Startup**. Hiding is panel access control, not encryption: anyone who can read the server's files, environment or console can still see them once the bot runs. Avoid sharing screenshots or exports containing configured values.
- Certificates and keys you upload (for example `/home/container/rabbitmq-ca.pem`) are never moved, changed or re-permissioned by updates. The tracked files under `certificates/` belong to the release: if you edit one, updates stop with a conflict instead of overwriting it.
- Use one Pterodactyl server for this bot deployment. Give shutdown at least 15 seconds so the shard manager can close its child processes and connections.

The egg's bot variables are generated from `.env.example` with `node scripts/generate-pterodactyl-egg.mjs`. Regenerate the JSON whenever configuration variables are added or renamed. Native canvas compatibility with the selected Node.js 24 runtime, panel import, installation, and live startup still need verification on the target Pterodactyl deployment.
