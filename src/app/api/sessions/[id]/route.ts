export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const session = await prisma.session.findUnique({
      where: { id },
      include: {
        events: {
          orderBy: { timestamp: "desc" },
          take: 500,
        },
        _count: { select: { events: true } },
      },
    });

    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 },
      );
    }

    const errorCount = await prisma.event.count({
      where: { sessionId: id, status: "error" },
    });

    const tokenTotals = await prisma.event.aggregate({
      where: { sessionId: id },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        cacheTokens: true,
      },
    });

    return NextResponse.json({
      session,
      eventCount: session._count.events,
      errorCount,
      tokenTotals: {
        input: tokenTotals._sum.inputTokens ?? 0,
        output: tokenTotals._sum.outputTokens ?? 0,
        cache: tokenTotals._sum.cacheTokens ?? 0,
      },
    });
  } catch (err) {
    console.error("[api/sessions/[id]] DB query failed:", err);
    return NextResponse.json(
      { error: "Database unavailable" },
      { status: 503 },
    );
  }
}
