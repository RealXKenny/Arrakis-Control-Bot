# RabbitMQ public certificates

These PEM files contain public server certificates only. They are deployment-specific trust anchors, not general-purpose CA bundles.

- `development-rabbitmq-server.pem`: development broker.
- `production-rabbitmq-server.pem`: production broker.
- `rabbitmq-server.pem`: matching copy of the current production public certificate extracted from the broker.

The production certificate was refreshed on October 19, 2026 and expires on October 19, 2027. Its SHA-256 fingerprint is `03:2A:6B:13:69:16:86:BA:2D:ED:4F:9D:58:D7:9D:21:5B:10:D1:D7:33:BD:46:B6:69:0B:95:98:ED:0C:51:6F`. Keep the two production copies synchronized when rotating the certificate; the Docker image uses `production-rabbitmq-server.pem`.

Select the certificate matching your broker. For the production deployment, start the bot from the repository root and configure:

```dotenv
RABBITMQ_CA_FILE=./certificates/production-rabbitmq-server.pem
RABBITMQ_TLS_SERVERNAME=dune-rmq-game
```

The production Docker image includes both public PEM files at `/opt/arrakis/certificates/`. Set `RABBITMQ_CA_FILE=/opt/arrakis/certificates/production-rabbitmq-server.pem` for the matching production broker, or use the development PEM for the matching development broker.

The connection URL must still use the reachable production address. Verify certificate provenance before trusting it; another installation should supply its own certificate. Replace the matching PEM after certificate rotation and restart the bot.

Never commit private keys, passwords or `.env`. See the [setup guide](../guides/rabbitmq-discord.md) for certificate extraction and configuration.
