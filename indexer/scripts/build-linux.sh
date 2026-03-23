#!/bin/bash
# Build pubkey-indexer as a self-contained Linux x64 binary (AppImage-style)
# Requires: npm, pkg  (npm install -g pkg)
set -e

cd "$(dirname "$0")/.."

echo "[build] Installing deps…"
npm install

echo "[build] Building Linux x64…"
npx pkg pubkey-indexer.js \
  --target node18-linux-x64 \
  --output dist/pubkey-indexer-linux \
  --compress GZip

echo "[build] Done: dist/pubkey-indexer-linux"
echo ""
echo "Usage:"
echo "  ./dist/pubkey-indexer-linux serve"
echo "  ./dist/pubkey-indexer-linux scan --from 943000"
