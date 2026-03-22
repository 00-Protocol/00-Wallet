#!/bin/bash
# Build pubkey-indexer for macOS (Intel + Apple Silicon)
# Requires: npm, pkg  (npm install -g pkg)
set -e

cd "$(dirname "$0")/.."

echo "[build] Installing deps…"
npm install

echo "[build] Building macOS Intel (x64)…"
npx pkg pubkey-indexer.js \
  --target node18-macos-x64 \
  --output dist/pubkey-indexer-mac \
  --compress GZip

echo "[build] Building macOS Apple Silicon (arm64)…"
npx pkg pubkey-indexer.js \
  --target node18-macos-arm64 \
  --output dist/pubkey-indexer-mac-arm64 \
  --compress GZip

echo "[build] Done:"
echo "  dist/pubkey-indexer-mac        (Intel)"
echo "  dist/pubkey-indexer-mac-arm64  (Apple Silicon)"
