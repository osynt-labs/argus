#!/bin/sh
set -e

echo "[startup] Running DB migrations..."
node -e "
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const migrations = [
    // 0001: initial schema — handled by prisma migrate deploy below
    // 0002: add missing EventType enum values
    \`ALTER TYPE \"EventType\" ADD VALUE IF NOT EXISTS 'MESSAGE_SENT'\`,
    \`ALTER TYPE \"EventType\" ADD VALUE IF NOT EXISTS 'MESSAGE_RECEIVED'\`,
    \`ALTER TYPE \"EventType\" ADD VALUE IF NOT EXISTS 'AGENT_START'\`,
    \`ALTER TYPE \"EventType\" ADD VALUE IF NOT EXISTS 'AGENT_END'\`,
    \`ALTER TYPE \"EventType\" ADD VALUE IF NOT EXISTS 'LLM_OUTPUT'\`,
  ];

  for (const sql of migrations) {
    try {
      await client.query(sql);
      console.log('[startup] OK:', sql.slice(0, 60));
    } catch (e) {
      // IF NOT EXISTS means this is safe to ignore duplicates
      if (!e.message.includes('already exists')) {
        console.warn('[startup] Migration warning:', e.message);
      }
    }
  }

  await client.end();
  console.log('[startup] Migrations complete.');
}

main().catch(e => {
  console.warn('[startup] Migration error (non-fatal):', e.message);
});
"

echo "[startup] Starting server..."
exec node server.js
