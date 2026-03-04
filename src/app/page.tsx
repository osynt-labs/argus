import { prisma } from "@/lib/prisma";
import { LiveFeed } from "@/components/LiveFeed";
import { StatsCards } from "@/components/StatsCards";
import { ToolChart } from "@/components/ToolChart";
import { formatDistanceToNow } from "date-fns";

async function getStats() {
  const now = new Date();
  const h24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const h1 = new Date(now.getTime() - 60 * 60 * 1000);

  const [total, last24h, last1h, byTool, errorsLast24h, tokenStats] =
    await Promise.all([
      prisma.event.count(),
      prisma.event.count({ where: { timestamp: { gte: h24 } } }),
      prisma.event.count({ where: { timestamp: { gte: h1 } } }),
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
  return prisma.event.findMany({
    orderBy: { timestamp: "desc" },
    take: 100,
  });
}

async function getActiveSessions() {
  const h1 = new Date(Date.now() - 60 * 60 * 1000);
  return prisma.session.findMany({
    where: { lastSeenAt: { gte: h1 } },
    orderBy: { lastSeenAt: "desc" },
    take: 10,
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
    <div className="min-h-screen bg-[#0a0a0f] text-white font-sans">
      {/* Header */}
      <header className="border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-2xl">👁</div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Argus</h1>
            <p className="text-xs text-white/30">AI Agent Observatory</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-white/40">Connected to OpenClaw</span>
        </div>
      </header>

      <main className="p-6 space-y-6 max-w-[1600px] mx-auto">
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

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Live feed — takes 2 cols */}
          <div
            className="lg:col-span-2 rounded-xl border border-white/5 bg-white/2 overflow-hidden"
            style={{ height: 600 }}
          >
            <LiveFeed initialEvents={recentEvents as any} />
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-4">
            {/* Tool chart */}
            <ToolChart
              data={stats.byTool.map((d) => ({
                toolName: d.toolName,
                _count: d._count.toolName,
              }))}
            />

            {/* Active sessions */}
            <div className="rounded-xl border border-white/5 bg-white/2 p-4">
              <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">
                Active Sessions (1h)
              </h3>
              {activeSessions.length === 0 && (
                <p className="text-xs text-white/20 text-center py-4">
                  No active sessions
                </p>
              )}
              <div className="space-y-2">
                {activeSessions.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-white/3 hover:bg-white/5 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-mono text-white/70 truncate">
                        {s.key ?? s.id.slice(0, 12)}...
                      </div>
                      <div className="text-[10px] text-white/30">
                        {formatDistanceToNow(s.lastSeenAt, { addSuffix: true })}
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <div className="text-xs text-white/50">
                        {s._count.events} events
                      </div>
                      <div className="text-[10px] text-red-400/60">
                        {s.totalErrors > 0 ? `${s.totalErrors} err` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
