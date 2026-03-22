#!/bin/sh
# Health check script for Start9. Called by StartOS to verify the service is up.
# Must exit 0 on success, non-zero on failure.
# Output must be valid JSON with "result" field.

PORT="${PORT:-3847}"
URL="http://localhost:${PORT}/api/health"

response=$(wget -qO- --timeout=5 "$URL" 2>/dev/null)

if [ -z "$response" ]; then
    echo '{"result":"failure","message":"Service not responding"}'
    exit 1
fi

status=$(echo "$response" | grep -o '"status":"[^"]*"' | sed 's/"status":"//;s/"//')

if [ "$status" = "ok" ]; then
    stats=$(wget -qO- --timeout=5 "http://localhost:${PORT}/api/stats" 2>/dev/null || echo '{}')
    cached=$(echo "$stats" | grep -o '"cached_blocks":[0-9]*' | grep -o '[0-9]*' || echo '0')
    echo "{\"result\":\"success\",\"message\":\"API ready. Cached blocks: ${cached}\"}"
    exit 0
else
    echo '{"result":"failure","message":"Service reported unhealthy status"}'
    exit 1
fi
