export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const url = new URL(_req.url);
    const cursor = url.searchParams.get("cursor");
    const limitParam = parseInt(url.searchParams.get("limit") ?? "500", 10);
    const limit = Math.min(Math.max(1, limitParam), 500);

    // ── Cursor-based pagination: return older events ──────────────────────
    if (cursor) {
      const sessionLookup = await prisma.session.findFirst({
        where: { OR: [{ id }, { key: id }] },
        select: { id: true },
      });

      if (!sessionLookup) {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
      }

      const cursorEvent = await prisma.event.findUnique({
        where: { id: cursor },
        select: { timestamp: true },
      });

      if (!cursorEvent) {
        return NextResponse.json({ error: "Cursor event not found" }, { status: 404 });
      }

      const events = await prisma.event.findMany({
        where: {
          sessionId: sessionLookup.id,
          timestamp: { lt: cursorEvent.timestamp },
        },
        orderBy: { timestamp: "desc" },
        take: limit,
      });

      const nextCursor = events.length > 0 ? events[events.length - 1].id : null;
      const hasMore = events.length === limit;

      return NextResponse.json({ events, nextCursor, hasMore });
    }

    // ── Initial load ──────────────────────────────────────────────────────
    const session = await prisma.session.findFirst({
      where: { OR: [{ id }, { key: id }] },
      include: {
        events: {
          orderBy: { timestamp: "desc" },
          take: limit,
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

    const hasMore = session._count.events > session.events.length;
    const nextCursor =
      session.events.length > 0
        ? session.events[session.events.length - 1].id
        : null;

    const errorCount = await prisma.event.count({
      where: { sessionId: session.id, status: "error" },
    });

    const tokenTotals = await prisma.event.aggregate({
      where: { sessionId: session.id },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        cacheTokens: true,
        costUsd: true,
      },
    });

    return NextResponse.json({
      session,
      eventCount: session._count.events,
      hasMore,
      nextCursor,
      errorCount,
      tokenTotals: {
        input: tokenTotals._sum.inputTokens ?? 0,
        output: tokenTotals._sum.outputTokens ?? 0,
        cache: tokenTotals._sum.cacheTokens ?? 0,
      },
      summary: {
        eventCount: session._count.events,
        errorCount,
        totalInputTokens: tokenTotals._sum.inputTokens ?? 0,
        totalOutputTokens: tokenTotals._sum.outputTokens ?? 0,
        totalCacheTokens: tokenTotals._sum.cacheTokens ?? 0,
        totalCostUsd: tokenTotals._sum.costUsd ?? 0,
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
