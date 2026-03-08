import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export type RunStatus = "running" | "done" | "error" | "stale";
export type RunTrigger = "cron" | "heartbeat" | "subagent" | "unknown";

export interface RunRow {
  id: string;
  sessionKey: string | null;
  label: string | null;
  triggerType: RunTrigger;
  jobName: string | null;
  status: RunStatus;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  totalEvents: number;
  totalErrors: number;
  parentSessionId: string | null;
}

/**
 * GET /api/runs
 * Lists all isolated runs (cron jobs + sub-agent sessions).
 * A "run" is a Session that has a CRON_RUN or AGENT_START event
 * (i.e. not the always-on main session).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100"), 500);
  const trigger = searchParams.get("trigger") as RunTrigger | null; // cron | subagent
  const status = searchParams.get("status") as RunStatus | null;   // running | done | error | stale
  const staleThresholdMs = 10 * 60 * 1000; // 10 min

  // Fetch sessions that have a CRON_RUN or AGENT_START event
  // We'll use a subquery to get the trigger type from the first event
  const rows = await (prisma.$queryRawUnsafe as any)(
    `SELECT
       s.id,
       s.key                                                AS "sessionKey",
       s.label,
       s."startedAt",
       s."lastSeenAt",
       s."totalEvents",
       s."totalErrors",
       -- trigger type: prefer CRON_RUN, else check AGENT_START
       CASE
         WHEN EXISTS (
           SELECT 1 FROM "events" e WHERE e."sessionId" = s.id AND e.type = 'CRON_RUN'
         ) THEN 'cron'
         WHEN s.key LIKE '%:cron:%' OR s.key LIKE 'cron:%' THEN 'cron'
         ELSE 'subagent'
       END                                                  AS "triggerType",
       -- job name from cron_run metadata or session key
       (SELECT e.metadata->>'trigger_preview'
          FROM "events" e
         WHERE e."sessionId" = s.id AND e.type = 'CRON_RUN'
         LIMIT 1)                                           AS "jobName",
       -- session_end timestamp if exists
       (SELECT e.timestamp
          FROM "events" e
         WHERE e."sessionId" = s.id AND e.type = 'SESSION_END'
         LIMIT 1)                                           AS "endedAt",
       -- has error events?
       EXISTS (
         SELECT 1 FROM "events" e
          WHERE e."sessionId" = s.id AND e.status = 'error'
       )                                                    AS "hasError",
       -- parent session (who spawned this via AGENT_SPAWN)
       (SELECT e."sessionId"
          FROM "events" e
         WHERE e.type = 'AGENT_SPAWN' AND e."subAgentId" = s.key
         LIMIT 1)                                           AS "parentSessionId"
     FROM "sessions" s
    WHERE (
      -- Has a CRON_RUN event
      EXISTS (SELECT 1 FROM "events" e WHERE e."sessionId" = s.id AND e.type = 'CRON_RUN')
      OR
      -- Is a known child session (subagent)
      EXISTS (SELECT 1 FROM "events" e WHERE e.type = 'AGENT_SPAWN' AND e."subAgentId" = s.key)
      OR
      -- Session key looks like a cron/isolated session
      s.key LIKE '%:cron:%'
    )
    ORDER BY s."startedAt" DESC
    LIMIT ${limit}`
  ) as Array<{
    id: string;
    sessionKey: string | null;
    label: string | null;
    startedAt: Date;
    lastSeenAt: Date;
    totalEvents: number;
    totalErrors: number;
    triggerType: string;
    jobName: string | null;
    endedAt: Date | null;
    hasError: boolean;
    parentSessionId: string | null;
  }>;

  const now = Date.now();

  const runs: RunRow[] = rows
    .map((r) => {
      const startMs = new Date(r.startedAt).getTime();
      const endMs = r.endedAt ? new Date(r.endedAt).getTime() : null;
      const lastMs = new Date(r.lastSeenAt).getTime();

      let runStatus: RunStatus;
      if (endMs) {
        runStatus = r.hasError ? "error" : "done";
      } else if (now - lastMs > staleThresholdMs) {
        runStatus = r.hasError ? "error" : "stale";
      } else {
        runStatus = "running";
      }

      return {
        id: r.id,
        sessionKey: r.sessionKey,
        label: r.label,
        triggerType: (r.triggerType as RunTrigger) ?? "unknown",
        jobName: r.jobName ?? r.label ?? r.sessionKey ?? null,
        status: runStatus,
        startedAt: r.startedAt.toISOString(),
        endedAt: r.endedAt ? r.endedAt.toISOString() : null,
        durationMs: endMs ? endMs - startMs : now - startMs,
        totalEvents: Number(r.totalEvents),
        totalErrors: Number(r.totalErrors),
        parentSessionId: r.parentSessionId,
      };
    })
    .filter((r) => {
      if (trigger && r.triggerType !== trigger) return false;
      if (status && r.status !== status) return false;
      return true;
    });

  return NextResponse.json({ runs });
}
