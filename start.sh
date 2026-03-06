#!/bin/sh
set -e
echo "[startup] Running Prisma migrations..."
node -e "
const { execSync } = require('child_process');
try {
  execSync('npx prisma migrate deploy', { stdio: 'inherit', cwd: '/app' });
  console.log('[startup] Migrations complete.');
} catch (e) {
  console.warn('[startup] Migration warning (may be safe to ignore):', e.message);
}
"
echo "[startup] Starting server..."
exec node server.js
