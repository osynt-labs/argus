# 👁 Argus — AI Agent Observatory

Full observability dashboard for OpenClaw AI agent activity. See every tool call, session, token usage, and error in real-time.

## Features

- **Live Feed** — SSE-powered real-time stream of every tool call
- **Stats** — Total events, error rate, token usage, avg latency
- **Tool Breakdown** — Bar chart of most-used tools (24h)
- **Active Sessions** — Sessions active in the last hour
- **Ingest API** — Secured with API key, accepts batch payloads

## Stack

- Next.js 15 (App Router, RSC)
- PostgreSQL via Neon + Prisma ORM
- Server-Sent Events for real-time
- Recharts for visualization
- Deployed on Vercel

## Setup

### 1. Create Neon database

[Create a free Neon project](https://neon.tech) → copy connection strings.

### 2. Environment variables

```bash
cp .env.example .env.local
# Fill in DATABASE_URL, DATABASE_URL_UNPOOLED, SETUP_SECRET
```

### 3. Run migrations

```bash
npx prisma migrate dev --name init
```

### 4. Create first API key

```bash
curl -X POST https://your-app.vercel.app/api/setup \
  -H "x-setup-secret: YOUR_SETUP_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"name": "openclaw"}'
```

### 5. Configure OpenClaw hook

In `openclaw.json`:

```json
{
  "hooks": {
    "onToolCall": {
      "url": "https://argus.osynt.ai/api/ingest",
      "headers": { "Authorization": "Bearer YOUR_API_KEY" }
    }
  }
}
```

## Ingest API

**POST /api/ingest**

Headers: `Authorization: Bearer <key>` or `X-API-Key: <key>`

Body (single or array):

```json
{
  "session_id": "abc123",
  "session_key": "agent:main:abc123",
  "model": "anthropic/claude-sonnet-4-6",
  "timestamp": "2026-03-04T10:00:00Z",
  "type": "tool_call",
  "tool_name": "exec",
  "duration_ms": 1234,
  "input_tokens": 500,
  "output_tokens": 150,
  "status": "ok"
}
```

## Infrastructure

See `terraform/` for Vercel deployment config.
