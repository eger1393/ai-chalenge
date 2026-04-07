#!/bin/sh
set -e
exec supergateway \
  --stdio "node /app/dist/index.js" \
  --outputTransport streamableHttp \
  --port 8097 \
  --host 0.0.0.0
