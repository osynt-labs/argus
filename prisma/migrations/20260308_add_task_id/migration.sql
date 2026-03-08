-- Add task_id to Event for mission/task grouping
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "taskId" TEXT;
CREATE INDEX IF NOT EXISTS "Event_taskId_idx" ON "Event"("taskId");

-- Add rootTaskId to Session (the first task_id seen for this session)  
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "rootTaskId" TEXT;
CREATE INDEX IF NOT EXISTS "Session_rootTaskId_idx" ON "Session"("rootTaskId");
