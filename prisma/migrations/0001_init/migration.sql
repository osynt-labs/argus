-- CreateEnum
CREATE TYPE "EventType" AS ENUM (
  'TOOL_CALL',
  'MESSAGE_SEND',
  'AGENT_SPAWN',
  'CRON_RUN',
  'ERROR',
  'SESSION_START',
  'SESSION_END',
  'MODEL_SWITCH'
);

-- CreateTable
CREATE TABLE "sessions" (
  "id" TEXT NOT NULL,
  "key" TEXT,
  "agentId" TEXT,
  "label" TEXT,
  "model" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL,
  "totalEvents" INTEGER NOT NULL DEFAULT 0,
  "totalTokens" INTEGER NOT NULL DEFAULT 0,
  "totalErrors" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_key_key" ON "sessions"("key");

-- CreateTable
CREATE TABLE "events" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "sessionId" TEXT NOT NULL,
  "timestamp" TIMESTAMP(3) NOT NULL,
  "type" "EventType" NOT NULL,
  "toolName" TEXT,
  "subAgentId" TEXT,
  "cronJobId" TEXT,
  "input" JSONB,
  "output" JSONB,
  "durationMs" INTEGER,
  "model" TEXT,
  "inputTokens" INTEGER,
  "outputTokens" INTEGER,
  "cacheTokens" INTEGER,
  "error" TEXT,
  "status" TEXT DEFAULT 'ok',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "events_sessionId_idx" ON "events"("sessionId");

-- CreateIndex
CREATE INDEX "events_timestamp_idx" ON "events"("timestamp");

-- CreateIndex
CREATE INDEX "events_type_idx" ON "events"("type");

-- CreateIndex
CREATE INDEX "events_toolName_idx" ON "events"("toolName");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "api_keys" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "name" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "lastUsed" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");
