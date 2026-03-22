#!/bin/bash
# Build pubkey-indexer for all platforms
set -e
DIR="$(dirname "$0")"
mkdir -p "$DIR/../dist"
bash "$DIR/build-linux.sh"
bash "$DIR/build-mac.sh"
bash "$DIR/build-windows.sh"
echo ""
echo "[build-all] All builds complete:"
ls -lh "$DIR/../dist/"
