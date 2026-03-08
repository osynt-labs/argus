import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/tasks
 * Returns all distinct tasks (grouped by taskId) with aggregate stats.
 */
export async function GET(req: NextRequest) {

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 200);
  const sessionId = url.searchParams.get("sessionId");

  // Aggregate events by taskId, get stats per task
  const where = {
    taskId: { not: null },
    ...(sessionId ? { sessionId } : {}),
  };

  const rawGroups = await prisma.$queryRawUnsafe<Array<{
    taskId: string;
    sessionId: string;
    minTs: Date;
    maxTs: Date;
    totalEvents: bigint;
    toolCalls: bigint;
    llmCalls: bigint;
    errors: bigint;
    subAgents: bigint;
    triggerType: string | null;
    triggerPreview: string | null;
  }>>(
    `SELECT
       "taskId",
       "sessionId",
       MIN("timestamp")                                         AS "minTs",
       MAX("timestamp")                                         AS "maxTs",
       COUNT(*)::bigint                                         AS "totalEvents",
       COUNT(*) FILTER (WHERE "type" = 'TOOL_CALL')::bigint    AS "toolCalls",
       COUNT(*) FILTER (WHERE "toolName" = 'llm_call')::bigint AS "llmCalls",
       COUNT(*) FILTER (WHERE "status" = 'error')::bigint      AS "errors",
       COUNT(*) FILTER (WHERE "type" = 'AGENT_SPAWN')::bigint  AS "subAgents",
       (SELECT e2."metadata"->>'trigger_type'
          FROM "Event" e2
         WHERE e2."taskId" = e."taskId"
           AND e2."metadata"->>'trigger_type' IS NOT NULL
         LIMIT 1)                                               AS "triggerType",
       (SELECT e2."metadata"->>'trigger_preview'
          FROM "Event" e2
         WHERE e2."taskId" = e."taskId"
           AND e2."metadata"->>'trigger_preview' IS NOT NULL
         LIMIT 1)                                               AS "triggerPreview"
     FROM "Event" e
    WHERE "taskId" IS NOT NULL
      ${sessionId ? `AND "sessionId" = '${sessionId}'` : ""}
    GROUP BY "taskId", "sessionId"
    ORDER BY "minTs" DESC
    LIMIT ${limit}`
  ) as any[];

  const tasks = rawGroups.map((r: any) => ({
    taskId: r.taskId,
    sessionId: r.sessionId,
    startedAt: r.minTs,
    endedAt: r.maxTs,
    durationMs: new Date(r.maxTs).getTime() - new Date(r.minTs).getTime(),
    totalEvents: Number(r.totalEvents),
    toolCalls: Number(r.toolCalls),
    llmCalls: Number(r.llmCalls),
    errors: Number(r.errors),
    subAgents: Number(r.subAgents),
    triggerType: r.triggerType ?? "unknown",
    triggerPreview: r.triggerPreview ?? null,
  }));

  return NextResponse.json({ tasks });
}
