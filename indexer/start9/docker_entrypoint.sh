#!/bin/sh
set -e

# ─── BCH Pubkey Indexer — Start9 Entrypoint ───────────────────────────────────
# Reads config from /data/start9/config.yaml (injected by StartOS) and
# translates it to environment variables before starting the indexer.

CONFIG_FILE="/data/start9/config.yaml"

# Helper: extract a YAML scalar value (simple key: value)
yaml_get() {
    grep -m1 "^${1}:" "$CONFIG_FILE" 2>/dev/null | sed 's/^[^:]*: *//' | tr -d '"' || true
}

# Apply config if present
if [ -f "$CONFIG_FILE" ]; then
    SOURCE="$(yaml_get source)"
    RPC_URL="$(yaml_get rpc_url)"
    RPC_USER="$(yaml_get rpc_user)"
    RPC_PASS="$(yaml_get rpc_pass)"
    FULCRUM_URL="$(yaml_get fulcrum_url)"
    MAX_RANGE="$(yaml_get max_range)"

    [ -n "$SOURCE" ]      && export SOURCE
    [ -n "$RPC_URL" ]     && export RPC_URL
    [ -n "$RPC_USER" ]    && export RPC_USER
    [ -n "$RPC_PASS" ]    && export RPC_PASS
    [ -n "$FULCRUM_URL" ] && export FULCRUM_URL
    [ -n "$MAX_RANGE" ]   && export MAX_RANGE
fi

# Defaults
export SOURCE="${SOURCE:-fulcrum}"
export CACHE_DIR="${CACHE_DIR:-/data/pubkeys}"
export PORT="${PORT:-3847}"
export CORS="true"

echo "[entrypoint] SOURCE=${SOURCE}"
echo "[entrypoint] CACHE_DIR=${CACHE_DIR}"
echo "[entrypoint] PORT=${PORT}"

mkdir -p "$CACHE_DIR"

exec node /app/pubkey-indexer.js serve
