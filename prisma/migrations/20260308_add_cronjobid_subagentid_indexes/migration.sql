-- Add index on cronJobId for faster cron run queries
CREATE INDEX IF NOT EXISTS "events_cronJobId_idx" ON "events"("cronJobId");
-- Add index on subAgentId for faster subagent event queries
CREATE INDEX IF NOT EXISTS "events_subAgentId_idx" ON "events"("subAgentId");
