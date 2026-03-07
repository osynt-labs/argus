#!/bin/sh
set -e

# ──────────────────────────────────────────────────────────────────────────────
# Wait for Cloud SQL Auth Proxy sidecar to be ready.
# InitContainers can't be used here because the Cloud SQL proxy sidecar
# isn't available during the init phase.
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
# Run Prisma migrations via pg (no prisma CLI needed — avoids wasm/dep issues).
# Tracks applied migrations in _prisma_migrations (Prisma's own table format).
# ──────────────────────────────────────────────────────────────────────────────
echo "[startup] Running DB migrations..."
node -e "
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // Ensure migrations tracking table exists (idempotent)
  await client.query(\`
    CREATE TABLE IF NOT EXISTS \"_prisma_migrations\" (
      id VARCHAR(36) PRIMARY KEY,
      checksum VARCHAR(64) NOT NULL,
      finished_at TIMESTAMPTZ,
      migration_name VARCHAR(255) NOT NULL,
      logs TEXT,
      rolled_back_at TIMESTAMPTZ,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      applied_steps_count INTEGER NOT NULL DEFAULT 0
    )
  \`);

  const migrationsDir = path.join(__dirname, 'prisma', 'migrations');
  const dirs = fs.readdirSync(migrationsDir)
    .filter(d => !d.endsWith('.toml') && fs.statSync(path.join(migrationsDir, d)).isDirectory())
    .sort();

  for (const name of dirs) {
    const sqlPath = path.join(migrationsDir, name, 'migration.sql');
    if (!fs.existsSync(sqlPath)) continue;

    const { rows } = await client.query(
      'SELECT id FROM \"_prisma_migrations\" WHERE migration_name = \$1 AND rolled_back_at IS NULL AND finished_at IS NOT NULL',
      [name]
    );
    if (rows.length > 0) {
      console.log('[startup] Already applied:', name);
      continue;
    }

    const sql = fs.readFileSync(sqlPath, 'utf8');
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');
    const id = crypto.randomUUID();

    console.log('[startup] Applying migration:', name);
    try {
      await client.query(sql);
      await client.query(
        'INSERT INTO \"_prisma_migrations\" (id, checksum, migration_name, finished_at, applied_steps_count) VALUES (\$1, \$2, \$3, NOW(), 1)',
        [id, checksum, name]
      );
      console.log('[startup] Applied:', name);
    } catch (e) {
      if (e.message && e.message.includes('already exists')) {
        console.log('[startup] Skipped (already exists):', name);
      } else {
        console.error('[startup] Migration error in', name + ':', e.message);
        process.exit(1);
      }
    }
  }

  await client.end();
  console.log('[startup] Migrations complete.');
}

run().catch(e => {
  console.error('[startup] Fatal migration error:', e.message);
  process.exit(1);
});
"

echo "[startup] Starting server..."
exec node server.js
