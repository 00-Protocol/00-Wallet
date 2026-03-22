#!/bin/bash
# Build pubkey-indexer for Windows x64 (.exe)
# Requires: npm, pkg  (npm install -g pkg)
# Can be run on Linux/Mac with cross-compilation support
set -e

cd "$(dirname "$0")/.."

echo "[build] Installing deps…"
npm install

echo "[build] Building Windows x64…"
npx pkg pubkey-indexer.js \
  --target node18-win-x64 \
  --output dist/pubkey-indexer-win.exe \
  --compress GZip

echo "[build] Done: dist/pubkey-indexer-win.exe"
echo ""
echo "Usage (PowerShell):"
echo "  .\\dist\\pubkey-indexer-win.exe serve"
echo "  .\\dist\\pubkey-indexer-win.exe scan --from 943000"
