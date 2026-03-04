"use client";

interface Stats {
  total: number;
  last24h: number;
  last1h: number;
  errorsLast24h: number;
  tokenStats: {
    _sum: { inputTokens?: number | null; outputTokens?: number | null; cacheTokens?: number | null };
    _avg: { durationMs?: number | null };
  };
}

function StatCard({
  label, value, sub, color = "blue", icon,
}: {
  label: string; value: string | number; sub?: string; color?: string; icon: string;
}) {
  const colors: Record<string, string> = {
    blue:   "border-blue-500/15   bg-blue-500/5",
    green:  "border-green-500/15  bg-green-500/5",
    red:    "border-red-500/15    bg-red-500/5",
    yellow: "border-yellow-500/15 bg-yellow-500/5",
    purple: "border-purple-500/15 bg-purple-500/5",
  };
  const textColors: Record<string, string> = {
    blue: "text-blue-300", green: "text-green-300",
    red: "text-red-300", yellow: "text-yellow-300", purple: "text-purple-300",
  };
  return (
    <div className={`rounded-xl border p-3 sm:p-4 ${colors[color]}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-white/30 text-[10px] uppercase tracking-wider font-medium leading-none">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className={`text-xl sm:text-2xl font-bold ${textColors[color]}`}>{value}</div>
      {sub && <div className="text-[10px] text-white/25 mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

export function StatsCards({ stats }: { stats: Stats }) {
  const totalTokens =
    (stats.tokenStats._sum.inputTokens ?? 0) +
    (stats.tokenStats._sum.outputTokens ?? 0);
  const cacheTokens = stats.tokenStats._sum.cacheTokens ?? 0;
  const avgLatency  = Math.round(stats.tokenStats._avg.durationMs ?? 0);
  const errorRate   =
    stats.last24h > 0
      ? ((stats.errorsLast24h / stats.last24h) * 100).toFixed(1)
      : "0";

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
      <StatCard icon="📡" label="Total events"  value={stats.total.toLocaleString()}        color="blue"   />
      <StatCard icon="📊" label="Last 24h"       value={stats.last24h.toLocaleString()}      sub={`${stats.last1h} last hour`}             color="green"  />
      <StatCard icon="🔴" label="Errors 24h"     value={stats.errorsLast24h}                 sub={`${errorRate}% error rate`}              color="red"    />
      <StatCard icon="🧠" label="Tokens 24h"     value={totalTokens > 1000 ? `${(totalTokens/1000).toFixed(1)}k` : totalTokens} sub={`${(cacheTokens/1000).toFixed(1)}k cached`} color="purple" />
      <StatCard icon="⚡" label="Avg latency"    value={`${avgLatency}ms`}                   sub="per tool call"                           color="yellow" />
    </div>
  );
}
