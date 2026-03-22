FROM node:18-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY pubkey-indexer.js ./
COPY package.json ./

# Start9: data volume mounted at /data
# Config injected as env vars via entrypoint
ENV CACHE_DIR=/data/pubkeys \
    PORT=3847

VOLUME ["/data"]
EXPOSE 3847

COPY start9/docker_entrypoint.sh /usr/local/bin/docker_entrypoint.sh
COPY start9/check-health.sh      /usr/local/bin/check-health.sh
RUN chmod +x /usr/local/bin/docker_entrypoint.sh /usr/local/bin/check-health.sh

ENTRYPOINT ["/usr/local/bin/docker_entrypoint.sh"]
