# Pterodactyl egg

Import [`pterodactyl/egg-arrakis-control-bot.json`](../pterodactyl/egg-arrakis-control-bot.json) into a Pterodactyl nest. This PTDL_v2 egg downloads a published bot source archive, verifies its SHA-256 checksum, and builds it with Node.js 24.

## Create the server

1. In the Pterodactyl admin panel, open **Nests**, select a nest, and import the egg JSON. Select the **Node.js 24** runtime when creating a server.
2. Give the server a memory limit and one allocation as required by your panel. The bot does not listen for incoming game traffic, so it does not use the allocation's port.
3. Enter `TOKEN`, `CONSOLE_URL`, and `CONSOLE_API_KEY`. The egg leaves them empty so no sample credentials are installed. Set other variables for the features you use. The egg exposes every variable in `.env.example`; leave optional values blank to disable their associated integrations.
4. Install the server and start it. The startup command is `cd /home/container && exec node dist/src/index.js`. The panel marks startup complete after a Discord shard reports ready.

Set `RELEASE_TAG` to `latest` or a stable tag such as `v2.0.0`, then run the panel's reinstall action to update. The installer checks the downloaded archive before extracting it, builds as an unprivileged user, and preserves unrelated files such as `.env`; back up the server and database before migration. Releases without a checksum are rejected unless an operator explicitly sets `ALLOW_UNVERIFIED_RELEASE=true` for an older release. Do not use that option for normal upgrades. The bot-specific GHCR image is no longer published; existing image-based servers must import the new egg and migrate their configuration.

## Integrations and secrets

- For releases with honeypot support, re-import the updated egg to expose `HONEYPOT_CHANNEL_ID`, `HONEYPOT_LOG_CHANNEL_ID`, `HONEYPOT_ACTION`, and `HONEYPOT_TIMEOUT_MINUTES`. Configure the trap and private log channels as described in [the honeypot guide](honeypot.md). Leave both channel IDs empty to disable it. The default action is an automatic ban.

- `CONSOLE_URL` must be HTTPS in production. Use externally reachable hostnames for the Console, PostgreSQL, RabbitMQ, and Lavalink services; `localhost` inside the bot container means the bot container itself.
- `DATABASE_URL` enables persistent features such as tickets, community levels, and music state. Set `DATABASE_SSL=true` when your PostgreSQL service requires TLS; certificates are verified unless `DATABASE_SSL_VERIFY=false`.
- The source archive includes this repository's public RabbitMQ server certificates under `/home/container/certificates/`. Set `RABBITMQ_CA_FILE` to the matching absolute path when trusting one of those brokers. For another broker or a rotated certificate, upload its trusted public CA PEM and set `RABBITMQ_CA_FILE` to that file, such as `/home/container/rabbitmq-ca.pem`. Do not upload a private key.
- The egg exposes credential variables in the server Startup tab so the server administrator can edit them. Limit access to that tab and avoid sharing screenshots or exports containing configured values.
- Use one Pterodactyl server for this bot deployment. Give shutdown at least 15 seconds so the shard manager can close its child processes and connections.

The egg's bot variables are generated from `.env.example` with `node scripts/generate-pterodactyl-egg.mjs`. Regenerate the JSON whenever configuration variables are added or renamed. Native canvas compatibility with the selected Node.js 24 runtime, panel import, installation, and live startup still need verification on the target Pterodactyl deployment.
