# RabbitMQ public certificates

These PEM files contain public server certificates only. They are deployment-specific trust anchors, not general-purpose CA bundles.

- `development-rabbitmq-server.pem`: development broker.
- `production-rabbitmq-server.pem`: production broker.

Select the certificate matching your broker. For the production deployment, start the bot from the repository root and configure:

```dotenv
RABBITMQ_CA_FILE=./certificates/production-rabbitmq-server.pem
RABBITMQ_TLS_SERVERNAME=dune-rmq-game
```

The production Docker image includes both public PEM files at `/opt/arrakis/certificates/`. Set `RABBITMQ_CA_FILE=/opt/arrakis/certificates/production-rabbitmq-server.pem` for the matching production broker, or use the development PEM for the matching development broker.

The connection URL must still use the reachable production address. Verify certificate provenance before trusting it; another installation should supply its own certificate. Replace the matching PEM after certificate rotation and restart the bot.

Never commit private keys, passwords or `.env`. See the [setup guide](../guides/rabbitmq-discord.md) for certificate extraction and configuration.
