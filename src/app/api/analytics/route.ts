export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const where = { timestamp: { gte: since } };

    const [
      toolGroups,
      modelGroups,
      typeGroups,
      totalCount,
      errorCount,
      events,
    ] = await Promise.all([
      prisma.event.groupBy({
        by: ["toolName"],
        where: { ...where, toolName: { not: null } },
        _count: true,
        _avg: { durationMs: true },
        orderBy: { _count: { toolName: "desc" } },
        take: 20,
      }),
      prisma.event.groupBy({
        by: ["model"],
        where: { ...where, model: { not: null } },
        _count: true,
        _sum: { inputTokens: true, outputTokens: true, cacheTokens: true },
        orderBy: { _count: { model: "desc" } },
      }),
      prisma.event.groupBy({
        by: ["type"],
        where,
        _count: true,
        orderBy: { _count: { type: "desc" } },
      }),
      prisma.event.count({ where }),
      prisma.event.count({ where: { ...where, status: "error" } }),
      prisma.event.findMany({
        where,
        select: { timestamp: true, status: true, toolName: true },
      }),
    ]);

    // Tool breakdown: enrich with per-tool error counts
    const toolErrorCounts = new Map<string, number>();
    for (const event of events) {
      if (event.status === "error" && event.toolName) {
        toolErrorCounts.set(
          event.toolName,
          (toolErrorCounts.get(event.toolName) ?? 0) + 1,
        );
      }
    }

    const toolBreakdown = toolGroups.map((g) => ({
      toolName: g.toolName,
      count: g._count,
      errors: toolErrorCounts.get(g.toolName!) ?? 0,
      avgDurationMs: Math.round(g._avg.durationMs ?? 0),
    }));

    const modelBreakdown = modelGroups.map((g) => ({
      model: g.model,
      count: g._count,
      inputTokens: g._sum.inputTokens ?? 0,
      outputTokens: g._sum.outputTokens ?? 0,
      cacheTokens: g._sum.cacheTokens ?? 0,
    }));

    const eventTypeBreakdown = typeGroups.map((g) => ({
      type: g.type,
      count: g._count,
    }));

    const errorRate = {
      total: totalCount,
      errors: errorCount,
      rate: totalCount > 0 ? errorCount / totalCount : 0,
    };

    // Peak hour calculation
    const hourCounts = new Map<number, number>();
    for (const event of events) {
      const hour = event.timestamp.getUTCHours();
      hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
    }

    let peakHour: { hour: number; count: number } = { hour: 0, count: 0 };
    for (const [hour, count] of hourCounts) {
      if (count > peakHour.count) {
        peakHour = { hour, count };
      }
    }

    return NextResponse.json({
      toolBreakdown,
      modelBreakdown,
      eventTypeBreakdown,
      errorRate,
      peakHour,
    });
  } catch (err) {
    console.error("[api/analytics] DB query failed:", err);
    return NextResponse.json(
      { error: "Database unavailable" },
      { status: 503 },
    );
  }
}
