-- Add task_id to events for mission/task grouping
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "taskId" TEXT;
CREATE INDEX IF NOT EXISTS "events_taskId_idx" ON "events"("taskId");

-- Add rootTaskId to sessions (the first task_id seen for this session)
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "rootTaskId" TEXT;
CREATE INDEX IF NOT EXISTS "sessions_rootTaskId_idx" ON "sessions"("rootTaskId");
