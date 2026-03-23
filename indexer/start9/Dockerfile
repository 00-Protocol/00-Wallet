FROM node:18-slim

WORKDIR /app

# Copy the indexer
COPY pubkey-indexer.js /app/pubkey-indexer.js

# Install ws dependency
RUN npm install ws && npm cache clean --force

# Data directory (mounted as Start9 volume 'main')
RUN mkdir -p /data/pubkeys/json /data/pubkeys/bin

EXPOSE 3847

ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3847

CMD ["node", "/app/pubkey-indexer.js", "serve"]
