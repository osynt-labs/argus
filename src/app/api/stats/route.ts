import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const now = new Date();
    const h24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const h1 = new Date(now.getTime() - 60 * 60 * 1000);

    const [total, last24h, last1h, byTool, byType, errorsLast24h, tokenStats] =
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
      ]);

    // costUsd column may not exist yet (migration pending) — fail gracefully
    let costUsd24h: number | null = null;
    try {
      const costStats = await prisma.event.aggregate({
        where: { timestamp: { gte: h24 }, costUsd: { not: null } },
        _sum: { costUsd: true },
      });
      costUsd24h = costStats._sum.costUsd ?? 0;
    } catch {
      // column not migrated yet — return null, UI shows "—"
    }

    return NextResponse.json({
      total,
      last24h,
      last1h,
      byTool,
      byType,
      errorsLast24h,
      tokenStats,
      costUsd24h,
    });
  } catch (err) {
    console.error("[api/stats] DB query failed:", err);
    return NextResponse.json(
      { error: "Database unavailable", ok: false },
      { status: 503 },
    );
  }
}
