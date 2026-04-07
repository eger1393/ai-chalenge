#!/bin/sh
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is required"
  exit 1
fi

exec supergateway \
  --stdio "mcp-server-postgres $DATABASE_URL" \
  --port 8096 \
  --host 0.0.0.0
