"use client";

import { useDashboard } from "./layout";
import { StatsCards } from "@/components/StatsCards";
import { ToolChart } from "@/components/ToolChart";
import { LiveFeed } from "@/components/LiveFeed";
import { SessionList } from "@/components/SessionList";

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
              <span className="text-[10px] text-white/20 tabular-nums">
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

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full flex flex-col lg:flex-row">
          {/* Left: Live Feed */}
          <div
            className="flex flex-col lg:w-[400px] xl:w-[440px] shrink-0 border-b lg:border-b-0 lg:border-r border-white/[0.06]"
            style={{ height: "clamp(300px, 50vh, 500px)" }}
            data-lg-full-height
          >
            <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center justify-between">
              <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">Live Feed</h2>
              <span className="text-[10px] text-white/15 tabular-nums">{events.length} events</span>
            </div>
            <div className="flex-1 min-h-0">
              <LiveFeed externalEvents={events as any} />
            </div>
          </div>

          {/* Right: Stats + Charts + Sessions */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {stats && (
              <>
                <StatsCards
                  stats={{
                    total: stats.total,
                    last24h: stats.last24h,
                    last1h: stats.last1h,
                    errorsLast24h: stats.errorsLast24h,
                    tokenStats: stats.tokenStats,
                  }}
                />
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <ToolChart
                    data={stats.byTool.map((d) => ({
                      toolName: d.toolName,
                      _count: d._count.toolName,
                    }))}
                  />
                  <SessionList sessions={sessions} />
                </div>
              </>
            )}
            {!stats && (
              <div className="flex items-center justify-center h-40">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-6 h-6 border-2 border-white/10 border-t-blue-400 rounded-full animate-spin" />
                  <span className="text-xs text-white/30">Loading data...</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
