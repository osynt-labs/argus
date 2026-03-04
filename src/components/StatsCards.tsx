"use client";

interface Stats {
  total: number;
  last24h: number;
  last1h: number;
  errorsLast24h: number;
  tokenStats: {
    _sum: { inputTokens?: number; outputTokens?: number; cacheTokens?: number };
    _avg: { durationMs?: number };
  };
}

function StatCard({
  label,
  value,
  sub,
  color = "blue",
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  const colors: Record<string, string> = {
    blue: "from-blue-500/10 to-blue-600/5 border-blue-500/20",
    green: "from-green-500/10 to-green-600/5 border-green-500/20",
    red: "from-red-500/10 to-red-600/5 border-red-500/20",
    yellow: "from-yellow-500/10 to-yellow-600/5 border-yellow-500/20",
    purple: "from-purple-500/10 to-purple-600/5 border-purple-500/20",
  };
  return (
    <div className={`rounded-xl border bg-gradient-to-br p-4 ${colors[color]}`}>
      <div className="text-xs text-white/40 uppercase tracking-wider font-medium mb-2">
        {label}
      </div>
      <div className="text-2xl font-bold text-white">{value.toLocaleString()}</div>
      {sub && <div className="text-xs text-white/30 mt-1">{sub}</div>}
    </div>
  );
}

export function StatsCards({ stats }: { stats: Stats }) {
  const totalTokens =
    (stats.tokenStats._sum.inputTokens ?? 0) +
    (stats.tokenStats._sum.outputTokens ?? 0);
  const cacheTokens = stats.tokenStats._sum.cacheTokens ?? 0;
  const avgLatency = Math.round(stats.tokenStats._avg.durationMs ?? 0);
  const errorRate =
    stats.last24h > 0
      ? ((stats.errorsLast24h / stats.last24h) * 100).toFixed(1)
      : "0";

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <StatCard label="Total Events" value={stats.total} color="blue" />
      <StatCard
        label="Last 24h"
        value={stats.last24h}
        sub={`${stats.last1h} last hour`}
        color="green"
      />
      <StatCard
        label="Errors 24h"
        value={stats.errorsLast24h}
        sub={`${errorRate}% error rate`}
        color="red"
      />
      <StatCard
        label="Tokens 24h"
        value={totalTokens.toLocaleString()}
        sub={`${cacheTokens.toLocaleString()} cached`}
        color="purple"
      />
      <StatCard
        label="Avg Latency"
        value={`${avgLatency}ms`}
        sub="per tool call"
        color="yellow"
      />
    </div>
  );
}
