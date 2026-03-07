#!/bin/sh
set -e

# ──────────────────────────────────────────────────────────────────────────────
# Wait for Cloud SQL Auth Proxy (sidecar) to be ready before running migrations.
# The proxy needs a few seconds to establish its Unix socket / TCP listener.
# ──────────────────────────────────────────────────────────────────────────────
echo "[startup] Waiting for Cloud SQL proxy..."
for i in $(seq 1 15); do
  if node -e "
    const net = require('net');
    const s = net.createConnection({ host: '127.0.0.1', port: 5432 });
    s.on('connect', () => { s.destroy(); process.exit(0); });
    s.on('error', () => { s.destroy(); process.exit(1); });
  " 2>/dev/null; then
    echo "[startup] DB ready after ${i}s."
    break
  fi
  if [ "$i" -eq 15 ]; then
    echo "[startup] DB not reachable after 15s — proceeding anyway."
  fi
  sleep 1
done

# ──────────────────────────────────────────────────────────────────────────────
# Run Prisma migrations.
# Using the full package path — the standalone build doesn't include the npx
# shim's dependencies, so we call the CLI entry point directly.
# ──────────────────────────────────────────────────────────────────────────────
echo "[startup] Running Prisma migrations..."
if node /app/node_modules/prisma/build/index.js migrate deploy; then
  echo "[startup] Migrations complete."
else
  echo "[startup] Migration failed — aborting startup." >&2
  exit 1
fi

echo "[startup] Starting server..."
exec node server.js
