# Pterodactyl egg

Import [`pterodactyl/egg-arrakis-control-bot.json`](../pterodactyl/egg-arrakis-control-bot.json) into a Pterodactyl nest. This is a PTDL_v2 egg for the prebuilt `ghcr.io/realxkenny/arrakis-control-bot:latest` image. Its installer is intentionally empty because the image contains the compiled bot and artwork.

## Create the server

1. In the Pterodactyl admin panel, open **Nests**, select a nest, and import the egg JSON. Select the **Arrakis Control Bot (GHCR)** image when creating a server.
2. Give the server a memory limit and one allocation as required by your panel. The bot does not listen for incoming game traffic, so it does not use the allocation's port.
3. Enter `TOKEN`, `CONSOLE_URL`, and `CONSOLE_API_KEY`. The egg leaves them empty so no sample credentials are installed. Set other variables for the features you use. The egg exposes every variable in `.env.example`; leave optional values blank to disable their associated integrations.
4. Start the server. The startup command is `cd /opt/arrakis && exec node dist/src/index.js`. The image's entrypoint runs the command supplied by Pterodactyl. The panel marks startup complete after a Discord shard reports ready.

The bot is stored in `/opt/arrakis` because Pterodactyl mounts server files at `/home/container`. Editing files under `/home/container` does not update the bot code. Pull a new `latest` image and restart the server to update; use a `sha-<full commit SHA>` tag in the server's image setting when you need a fixed build. CI publishes these images only after the repository checks and an image smoke test pass.

## Integrations and secrets

- `CONSOLE_URL` must be HTTPS in production. Use externally reachable hostnames for the Console, PostgreSQL, RabbitMQ, and Lavalink services; `localhost` inside the bot container means the bot container itself.
- `DATABASE_URL` enables persistent features such as tickets, community levels, and music state. Set `DATABASE_SSL=true` when your PostgreSQL service requires TLS.
- The image includes this repository's public RabbitMQ server certificates at `/opt/arrakis/certificates/production-rabbitmq-server.pem` and `/opt/arrakis/certificates/development-rabbitmq-server.pem`. Set `RABBITMQ_CA_FILE` to the matching absolute path when trusting one of those brokers. For another broker or a rotated certificate, upload its trusted public CA PEM and set `RABBITMQ_CA_FILE` to that file, such as `/home/container/rabbitmq-ca.pem`. Do not upload a private key.
- The egg exposes credential variables in the server Startup tab so the server administrator can edit them. Limit access to that tab and avoid sharing screenshots or exports containing configured values.
- Use one Pterodactyl server for this bot deployment. Give shutdown at least 15 seconds so the shard manager can close its child processes and connections.

The egg's variables are generated from `.env.example` with `node scripts/generate-pterodactyl-egg.mjs`. Regenerate the JSON whenever configuration variables are added or renamed. A panel import and live bot startup still need to be verified on the target Pterodactyl deployment.
