import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const now = new Date();
    const h24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const h1 = new Date(now.getTime() - 60 * 60 * 1000);

    const [total, last24h, last1h, byTool, byType, errorsLast24h, tokenStats, costResult] =
      await Promise.all([
        prisma.event.count(),
        prisma.event.count({ where: { timestamp: { gte: h24 } } }),
        prisma.event.count({ where: { timestamp: { gte: h1 } } }),
        prisma.event.groupBy({
          by: ["toolName"],
          where: { toolName: { not: null }, timestamp: { gte: h24 } },
          _count: true,
          orderBy: { _count: { toolName: "desc" } },
          take: 10,
        }),
        prisma.event.groupBy({
          by: ["type"],
          where: { timestamp: { gte: h24 } },
          _count: true,
        }),
        prisma.event.count({
          where: { status: "error", timestamp: { gte: h24 } },
        }),
        prisma.event.aggregate({
          where: { timestamp: { gte: h24 } },
          _sum: { inputTokens: true, outputTokens: true, cacheTokens: true },
          _avg: { durationMs: true },
        }),
        prisma.event.aggregate({
          where: { timestamp: { gte: h24 } },
          _sum: { costUsd: true },
        }),
      ]);

    // Estimate cost from token counts when costUsd is not recorded in DB
    const INPUT_RATE = 3.0;   // $3/M input tokens (Claude Sonnet 4.x)
    const OUTPUT_RATE = 15.0; // $15/M output tokens
    const CACHE_RATE = 0.30;  // $0.30/M cache read tokens
    const est =
      (tokenStats._sum.inputTokens ?? 0) * INPUT_RATE / 1_000_000 +
      (tokenStats._sum.outputTokens ?? 0) * OUTPUT_RATE / 1_000_000 +
      (tokenStats._sum.cacheTokens ?? 0) * CACHE_RATE / 1_000_000;

    return NextResponse.json({
      total,
      last24h,
      last1h,
      byTool,
      byType,
      errorsLast24h,
      tokenStats,
      costUsd24h: costResult._sum.costUsd ?? (est > 0 ? est : 0),
      estimatedCostUsd: costResult._sum.costUsd ?? (est > 0 ? est : null),
    });
  } catch (err) {
    console.error("[api/stats] DB query failed:", err);
    return NextResponse.json(
      { error: "Database unavailable", ok: false },
      { status: 503 },
    );
  }
}
