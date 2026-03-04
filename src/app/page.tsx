import { prisma } from "@/lib/prisma";
import { LiveFeed } from "@/components/LiveFeed";
import { StatsCards } from "@/components/StatsCards";
import { ToolChart } from "@/components/ToolChart";
import { Header } from "@/components/Header";
import { formatDistanceToNow } from "date-fns";

async function getStats() {
  const now  = new Date();
  const h24  = new Date(now.getTime() - 86_400_000);
  const h1   = new Date(now.getTime() -  3_600_000);

  const [total, last24h, last1h, byTool, errorsLast24h, tokenStats] =
    await Promise.all([
      prisma.event.count(),
      prisma.event.count({ where: { timestamp: { gte: h24 } } }),
      prisma.event.count({ where: { timestamp: { gte: h1  } } }),
      prisma.event.groupBy({
        by: ["toolName"],
        where: { toolName: { not: null }, timestamp: { gte: h24 } },
        _count: true,
        orderBy: { _count: { toolName: "desc" } },
        take: 8,
      }),
      prisma.event.count({ where: { status: "error", timestamp: { gte: h24 } } }),
      prisma.event.aggregate({
        where: { timestamp: { gte: h24 } },
        _sum: { inputTokens: true, outputTokens: true, cacheTokens: true },
        _avg: { durationMs: true },
      }),
    ]);

  return { total, last24h, last1h, byTool, errorsLast24h, tokenStats };
}

async function getRecentEvents() {
  return prisma.event.findMany({ orderBy: { timestamp: "desc" }, take: 100 });
}

async function getActiveSessions() {
  const h1 = new Date(Date.now() - 3_600_000);
  return prisma.session.findMany({
    where: { lastSeenAt: { gte: h1 } },
    orderBy: { lastSeenAt: "desc" },
    take: 8,
    include: { _count: { select: { events: true } } },
  });
}

export default async function DashboardPage() {
  const [stats, recentEvents, activeSessions] = await Promise.all([
    getStats(),
    getRecentEvents(),
    getActiveSessions(),
  ]);

  return (
    <div className="flex flex-col h-full min-h-screen">
      <Header />

      <main className="flex-1 overflow-hidden">
        {/* ── Mobile: vertical stack, Desktop: side-by-side ─────────── */}
        <div className="h-full flex flex-col lg:flex-row">

          {/* ── LEFT / TOP: Live Feed ──────────────────────────────── */}
          <div className="flex flex-col lg:w-[420px] xl:w-[480px] shrink-0 border-b lg:border-b-0 lg:border-r border-white/5"
               style={{ height: "clamp(320px, 55vh, 600px)" }}
               data-lg-full-height>
            {/* Feed header */}
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
              <h2 className="text-xs font-semibold text-white/50 uppercase tracking-wider">Live Feed</h2>
            </div>
            <div className="flex-1 min-h-0">
              <LiveFeed initialEvents={recentEvents as any} />
            </div>
          </div>

          {/* ── RIGHT / BOTTOM: Stats + Charts + Sessions ─────────── */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">

            {/* Stats */}
            <StatsCards
              stats={{
                total: stats.total,
                last24h: stats.last24h,
                last1h: stats.last1h,
                errorsLast24h: stats.errorsLast24h,
                tokenStats: stats.tokenStats,
              }}
            />

            {/* Tool chart */}
            <ToolChart
              data={stats.byTool.map((d) => ({
                toolName: d.toolName,
                _count: d._count.toolName,
              }))}
            />

            {/* Active sessions */}
            <div className="rounded-xl border border-white/5 bg-white/2 p-4">
              <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
                Active Sessions (1h)
                <span className="ml-2 text-white/20 normal-case font-normal">
                  {activeSessions.length} running
                </span>
              </h3>

              {activeSessions.length === 0 ? (
                <p className="text-xs text-white/15 text-center py-4">No active sessions</p>
              ) : (
                <div className="space-y-2">
                  {activeSessions.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-white/3 hover:bg-white/5 active:bg-white/6 transition-colors cursor-default"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-mono text-white/70 truncate">
                          {s.key ?? s.id.slice(0, 14) + "…"}
                        </div>
                        <div className="text-[10px] text-white/25 mt-0.5">
                          {formatDistanceToNow(s.lastSeenAt, { addSuffix: true })}
                          {s.model && <span className="ml-2 text-white/15">{s.model.split("/").pop()}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <div className="text-xs font-semibold text-white/50">{s._count.events}</div>
                        <div className="text-[10px] text-white/20">events</div>
                        {s.totalErrors > 0 && (
                          <div className="text-[10px] text-red-400/60">{s.totalErrors} err</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
