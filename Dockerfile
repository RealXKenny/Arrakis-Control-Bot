FROM node:24-bookworm AS build

WORKDIR /opt/arrakis
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
COPY data/ ./data/
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates libcairo2 libpango-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/arrakis
COPY --chown=node:node --from=build /opt/arrakis/package.json ./
COPY --chown=node:node --from=build /opt/arrakis/node_modules/ ./node_modules/
COPY --chown=node:node --from=build /opt/arrakis/dist/ ./dist/
COPY --chown=node:node --from=build /opt/arrakis/data/ ./data/

USER node
CMD ["node", "dist/src/index.js"]
