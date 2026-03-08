import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/tasks/:taskId
 * Returns all events for a task, including sub-agent session events.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { taskId: string } }
) {

  const { taskId } = params;

  // All events tagged with this task_id (cast to any since Prisma types may not be regenerated yet)
  const events = await (prisma.event as any).findMany({
    where: { taskId },
    orderBy: { timestamp: "asc" },
  }) as any[];

  // Find sub-agent sessions spawned during this task
  const spawnEvents = events.filter(
    (e) => e.type === "AGENT_SPAWN" && e.subAgentId
  );
  const subAgentSessionKeys = spawnEvents
    .map((e) => e.subAgentId)
    .filter(Boolean) as string[];

  // Load sub-agent session events (one level deep)
  const subAgentData: Record<
    string,
    { session: { id: string; key?: string | null }; events: typeof events }
  > = {};

  if (subAgentSessionKeys.length > 0) {
    const subSessions = await prisma.session.findMany({
      where: { key: { in: subAgentSessionKeys } },
      include: {
        events: { orderBy: { timestamp: "asc" } },
      },
    });
    for (const s of subSessions) {
      subAgentData[s.key ?? s.id] = {
        session: { id: s.id, key: s.key },
        events: s.events,
      };
    }
  }

  return NextResponse.json({ taskId, events, subAgentData });
}
