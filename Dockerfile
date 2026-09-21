FROM node:24-bookworm AS build

WORKDIR /opt/arrakis
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
COPY data/ ./data/
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim

LABEL org.opencontainers.image.description="Discord bot for Dune: Awakening communities with moderation, server operations, music, and integrations."

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates libcairo2 libpango-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 \
    && rm -rf /var/lib/apt/lists/* \
    && usermod --login container --home /home/container --move-home node \
    && groupmod --new-name container node

WORKDIR /opt/arrakis
COPY --chown=container:container --from=build /opt/arrakis/package.json ./
COPY --chown=container:container --from=build /opt/arrakis/node_modules/ ./node_modules/
COPY --chown=container:container --from=build /opt/arrakis/dist/ ./dist/
COPY --chown=container:container --from=build /opt/arrakis/data/ ./data/
COPY --chown=container:container certificates/production-rabbitmq-server.pem certificates/development-rabbitmq-server.pem ./certificates/
COPY --chown=container:container docker/entrypoint.sh /entrypoint.sh

USER container
ENV USER=container HOME=/home/container NODE_ENV=production
WORKDIR /home/container
CMD ["/bin/sh", "/entrypoint.sh"]
