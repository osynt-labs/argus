"use client";

interface Stats {
  total: number;
  last24h: number;
  last1h: number;
  errorsLast24h: number;
  costUsd24h?: number | null;
  tokenStats: {
    _sum: { inputTokens?: number | null; outputTokens?: number | null; cacheTokens?: number | null };
    _avg: { durationMs?: number | null };
  };
}

function formatCost(usd: number): string {
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd >= 0.01) return `$${usd.toFixed(3)}`;
  return `$${(usd * 1000).toFixed(2)}m`;
}

function StatCard({
  label, value, sub, color = "blue", icon, trend,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  icon: string;
  trend?: "up" | "down" | "neutral";
}) {
  const borderColors: Record<string, string> = {
    blue:   "border-l-blue-500/50",
    green:  "border-l-green-500/50",
    red:    "border-l-red-500/50",
    yellow: "border-l-yellow-500/50",
    purple: "border-l-purple-500/50",
    emerald:"border-l-emerald-500/50",
  };
  const bgColors: Record<string, string> = {
    blue:   "bg-blue-500/[0.04]",
    green:  "bg-green-500/[0.04]",
    red:    "bg-red-500/[0.04]",
    yellow: "bg-yellow-500/[0.04]",
    purple: "bg-purple-500/[0.04]",
    emerald:"bg-emerald-500/[0.04]",
  };
  const textColors: Record<string, string> = {
    blue: "text-blue-300", green: "text-green-300",
    red: "text-red-300", yellow: "text-yellow-300",
    purple: "text-purple-300", emerald: "text-emerald-300",
  };
  const trendIcon = trend === "up" ? "↑" : trend === "down" ? "↓" : null;
  const trendColor = trend === "up" ? "text-emerald-400" : trend === "down" ? "text-red-400" : "";

  return (
    <div className={`rounded-xl border border-white/[0.06] border-l-2 ${borderColors[color]} ${bgColors[color]} p-3 sm:p-3.5 flex flex-col gap-1.5 sm:gap-2 min-h-[80px] sm:min-h-0`}>
      <div className="flex items-center justify-between">
        <span className="text-white/30 text-[10px] uppercase tracking-wider font-medium leading-none">{label}</span>
        <span className="text-sm sm:text-base opacity-70">{icon}</span>
      </div>
      <div className="flex items-end gap-1.5 sm:gap-2">
        <div className={`text-xl sm:text-2xl md:text-3xl font-bold tabular-nums leading-none ${textColors[color]}`}>{value}</div>
        {trendIcon && <span className={`text-xs font-semibold mb-0.5 ${trendColor}`}>{trendIcon}</span>}
      </div>
      {sub && <div className="text-[10px] sm:text-[11px] text-white/25 truncate leading-none">{sub}</div>}
    </div>
  );
}

export function StatsCards({ stats }: { stats: Stats }) {
  const totalTokens =
    (stats.tokenStats._sum.inputTokens ?? 0) +
    (stats.tokenStats._sum.outputTokens ?? 0);
  const cacheTokens = stats.tokenStats._sum.cacheTokens ?? 0;
  const cacheRatio = totalTokens > 0 ? Math.round((cacheTokens / (totalTokens + cacheTokens)) * 100) : 0;
  const avgLatency  = Math.round(stats.tokenStats._avg.durationMs ?? 0);
  const errorRate   = stats.last24h > 0
    ? ((stats.errorsLast24h / stats.last24h) * 100).toFixed(1)
    : "0";
  const eventsPerHour = Math.round(stats.last24h / 24);
  const cost = stats.costUsd24h ?? null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
      <StatCard
        icon="📡"
        label="Total events"
        value={stats.total.toLocaleString()}
        sub={`${eventsPerHour}/hr avg`}
        color="blue"
      />
      <StatCard
        icon="⚡"
        label="Last hour"
        value={stats.last1h.toLocaleString()}
        sub={`${stats.last24h.toLocaleString()} in 24h`}
        color="green"
        trend={stats.last1h > eventsPerHour ? "up" : stats.last1h < eventsPerHour ? "down" : "neutral"}
      />
      <StatCard
        icon="🔴"
        label="Errors 24h"
        value={stats.errorsLast24h}
        sub={`${errorRate}% error rate`}
        color="red"
        trend={stats.errorsLast24h > 0 ? "up" : undefined}
      />
      <StatCard
        icon="🧠"
        label="Tokens 24h"
        value={totalTokens > 1_000_000 ? `${(totalTokens / 1_000_000).toFixed(1)}M` : totalTokens > 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : String(totalTokens)}
        sub={`${cacheRatio}% cache hit`}
        color="purple"
      />
      <StatCard
        icon="⏱"
        label="Avg latency"
        value={avgLatency >= 1000 ? `${(avgLatency / 1000).toFixed(1)}s` : `${avgLatency}ms`}
        sub="per tool call"
        color="yellow"
      />
      <StatCard
        icon="💰"
        label="Cost 24h"
        value={cost != null ? formatCost(cost) : "—"}
        sub="LLM spend"
        color="emerald"
      />
    </div>
  );
}
