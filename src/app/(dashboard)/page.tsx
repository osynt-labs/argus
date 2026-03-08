"use client";

import { useDashboard } from "./layout";
import { StatsCards } from "@/components/StatsCards";
import { ToolChart } from "@/components/ToolChart";
import { LiveFeed } from "@/components/LiveFeed";
import { SessionList } from "@/components/SessionList";

function StatsCardSkeleton() {
  return (
    <div className="rounded-xl border border-white/[0.06] border-l-2 border-l-white/10 bg-white/[0.02] p-3 sm:p-3.5 flex flex-col gap-1.5 sm:gap-2 min-h-[80px] sm:min-h-0">
      <div className="flex items-center justify-between">
        <div className="h-2.5 w-20 rounded-full bg-white/[0.06] animate-pulse" />
        <div className="h-4 w-4 rounded bg-white/[0.04] animate-pulse" />
      </div>
      <div className="h-7 w-16 rounded-lg bg-white/[0.06] animate-pulse" />
      <div className="h-2 w-24 rounded-full bg-white/[0.04] animate-pulse" />
    </div>
  );
}

function StatsCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
      {Array.from({ length: 6 }).map((_, i) => <StatsCardSkeleton key={i} />)}
    </div>
  );
}

export default function OverviewPage() {
  const { stats, events, sessions, connState, dbHealthy, lastRefresh } = useDashboard();

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-white/[0.06]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-white">Overview</h1>
            <p className="text-xs text-white/30 mt-0.5">Real-time observability for OpenClaw</p>
          </div>
          <div className="flex items-center gap-3">
            {lastRefresh && (
              <span className="text-[10px] text-white/20 tabular-nums hidden sm:inline">
                {lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
            {!dbHealthy && (
              <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                DB Issues
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Content - Mobile-first layout */}
      <div className="flex-1 overflow-hidden">
        {/* ═══════════════════════════════════════════════════════════════
            MOBILE: Stacked vertical layout
            - Stats Cards
            - Live Feed (compact, 40vh)
            - Top Tools chart
            - Active Sessions
            ═══════════════════════════════════════════════════════════════ */}
        <div className="lg:hidden h-full overflow-y-auto">
          <div className="p-4 space-y-4">
            {/* Stats Cards - 2x3 grid on mobile */}
            {stats && (
              <StatsCards
                stats={{
                  total: stats.total,
                  last24h: stats.last24h,
                  last1h: stats.last1h,
                  errorsLast24h: stats.errorsLast24h,
                  costUsd24h: stats.costUsd24h,
                  estimatedCostUsd: stats.estimatedCostUsd,
                  tokenStats: stats.tokenStats,
                }}
              />
            )}

            {/* Live Feed - compact mobile version */}
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center justify-between">
                <h2 className="text-xs font-semibold text-white/40">Live Feed</h2>
                <span className="text-[10px] text-white/15 tabular-nums">{events.length} events</span>
              </div>
              <div className="h-[40vh] min-h-[280px] max-h-[400px]">
                <LiveFeed externalEvents={events as any} />
              </div>
            </div>

            {/* Charts + Sessions */}
            {stats && (
              <>
                <ToolChart
                  data={stats.byTool.map((d) => ({
                    toolName: d.toolName,
                    _count: typeof (d._count as any) === 'object' ? (d._count as any).toolName ?? 0 : (d._count as any) ?? 0,
                  }))}
                />
                <SessionList sessions={sessions} />
              </>
            )}

            {!stats && <StatsCardsSkeleton />}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            DESKTOP: Side-by-side layout (original)
            - Left: Live Feed (full height)
            - Right: Stats + Charts + Sessions
            ═══════════════════════════════════════════════════════════════ */}
        <div className="hidden lg:flex h-full flex-row">
          {/* Left: Live Feed */}
          <div className="flex flex-col w-[400px] xl:w-[440px] shrink-0 border-r border-white/[0.06] h-full">
            <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center justify-between">
              <h2 className="text-xs font-semibold text-white/40">Live Feed</h2>
              <span className="text-[10px] text-white/15 tabular-nums">{events.length} events</span>
            </div>
            <div className="flex-1 min-h-0">
              <LiveFeed externalEvents={events as any} />
            </div>
          </div>

          {/* Right: Stats + Charts + Sessions */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {stats && (
              <>
                <StatsCards
                  stats={{
                    total: stats.total,
                    last24h: stats.last24h,
                    last1h: stats.last1h,
                    errorsLast24h: stats.errorsLast24h,
                    costUsd24h: stats.costUsd24h,
                    estimatedCostUsd: stats.estimatedCostUsd,
                    tokenStats: stats.tokenStats,
                  }}
                />
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <ToolChart
                    data={stats.byTool.map((d) => ({
                      toolName: d.toolName,
                      _count: typeof (d._count as any) === 'object' ? (d._count as any).toolName ?? 0 : (d._count as any) ?? 0,
                    }))}
                  />
                  <SessionList sessions={sessions} />
                </div>
              </>
            )}
            {!stats && <StatsCardsSkeleton />}
          </div>
        </div>
      </div>
    </div>
  );
}
