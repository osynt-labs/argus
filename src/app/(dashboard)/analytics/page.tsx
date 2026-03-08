"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useDashboard } from "../layout";
import {
  AreaChart, Area, BarChart, Bar, ComposedChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, CartesianGrid,
} from "recharts";
import { format } from "date-fns";

const COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1"];

interface TimelineBucket {
  time: string;
  total: number;
  errors: number;
  tools: number;
  cost?: number;
}

interface AnalyticsData {
  toolBreakdown: { toolName: string; count: number; errors?: number; avgDurationMs?: number }[];
  modelBreakdown: { model: string; _count?: number; count?: number; tokens?: number; inputTokens?: number; outputTokens?: number; cacheTokens?: number }[];
  eventTypeBreakdown: { type: string; _count?: number; count?: number }[];
  errorRate: { total: number; errors: number; rate: number };
  peakHour?: { hour: number; count: number };
}

const TYPE_LABELS: Record<string, string> = {
  TOOL_CALL: "Tool Calls",
  MESSAGE_SEND: "Messages",
  AGENT_SPAWN: "Agent Spawns",
  CRON_RUN: "Cron Runs",
  ERROR: "Errors",
  SESSION_START: "Session Starts",
  SESSION_END: "Session Ends",
  MODEL_SWITCH: "Model Switches",
};

function ModelTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="bg-[#141420] border border-white/10 rounded-xl px-3 py-2 shadow-2xl">
      <p className="text-[10px] text-white/40 mb-1.5">{d.name}</p>
      <p className="text-xs text-white/60">Calls: <span className="font-semibold text-white/80">{d.count?.toLocaleString()}</span></p>
      <p className="text-xs text-blue-400">Input: <span className="font-semibold">{d.inputTokens?.toLocaleString()}</span></p>
      <p className="text-xs text-purple-400">Output: <span className="font-semibold">{d.outputTokens?.toLocaleString()}</span></p>
      {d.cacheTokens > 0 && (
        <p className="text-xs text-emerald-400">Cache: <span className="font-semibold">{d.cacheTokens?.toLocaleString()}</span></p>
      )}
      <p className="text-xs text-white/30 mt-1 border-t border-white/10 pt-1">
        Total: <span className="font-semibold">{d.totalTokens?.toLocaleString()} tokens</span>
      </p>
    </div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const successEntry = payload.find((p: any) => p.name === "Successful");
  const errorEntry = payload.find((p: any) => p.name === "Errors");
  const hasToolData = successEntry !== undefined && errorEntry !== undefined;
  const total = hasToolData ? (successEntry.value ?? 0) + (errorEntry.value ?? 0) : 0;
  const errorRate = hasToolData && total > 0
    ? ((errorEntry.value / total) * 100).toFixed(1)
    : null;
  const costEntry = payload.find((p: any) => p.dataKey === "cost");
  return (
    <div className="bg-[#141420] border border-white/10 rounded-xl px-3 py-2 shadow-2xl">
      <p className="text-[10px] text-white/40 mb-1">{label}</p>
      {payload.filter((p: any) => p.dataKey !== "cost").map((p: any, i: number) => (
        <p key={i} className="text-xs" style={{ color: p.color }}>
          {p.name}: <span className="font-semibold">{p.value}</span>
        </p>
      ))}
      {hasToolData && errorRate !== null && (
        <p className="text-xs text-red-400/80 mt-1 border-t border-white/10 pt-1">
          Error rate: <span className="font-semibold">{errorRate}%</span>
          {errorEntry.value > 0 && <span className="text-white/30"> ({errorEntry.value} errors)</span>}
        </p>
      )}
      {errorEntry?.value > 0 && (
        <p className="text-[9px] text-white/30 mt-1">Click to view error events</p>
      )}
      {costEntry != null && (costEntry.value as number) > 0 && (
        <p className="text-xs text-amber-400/80 mt-1 border-t border-white/10 pt-1">
          Cost: <span className="font-semibold">${(costEntry.value as number).toFixed(4)}</span>
        </p>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  const { stats, events } = useDashboard();
  const router = useRouter();
  const [timeline, setTimeline] = useState<TimelineBucket[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [timeRange, setTimeRange] = useState<"24" | "72" | "168">("24");
  const [loading, setLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => { setIsMounted(true); }, []);

  const fetchData = (currentRange: "24" | "72" | "168") => {
    setLoading(true);
    Promise.all([
      fetch(`/api/analytics/timeline?hours=${currentRange}&bucket=hour`).then((r) => r.json()),
      fetch("/api/analytics").then((r) => r.json()),
    ])
      .then(([timelineData, analyticsData]) => {
        setTimeline(timelineData.buckets ?? []);
        setAnalytics(analyticsData);
        setLastUpdated(new Date());
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const handleRefresh = () => {
    fetchData(timeRange);
  };

  useEffect(() => {
    fetchData(timeRange);

    if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    refreshIntervalRef.current = setInterval(() => {
      fetchData(timeRange);
    }, 30_000);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [timeRange]);

  const timelineFormatted = timeline.map((b) => ({
    ...b,
    label: format(new Date(b.time), timeRange === "168" ? "EEE HH:mm" : "HH:mm"),
  }));

  const handleTimelineBucketClick = useCallback((data: any) => {
    if (!data || data.activeTooltipIndex == null) return;
    const originalBucket = timeline[data.activeTooltipIndex];
    if (!originalBucket || originalBucket.errors === 0) return;
    const startMs = new Date(originalBucket.time).getTime();
    const endMs = startMs + 60 * 60 * 1000; // 1 hour bucket
    router.push(`/events?timeStart=${startMs}&timeEnd=${endMs}&status=error`);
  }, [timeline, router]);

  // Peak error rate bucket (only where total > 0 and errors > 0)
  const peakErrorBucket = timelineFormatted.reduce<typeof timelineFormatted[0] | null>(
    (best, b) => {
      if (b.total <= 0 || b.errors <= 0) return best;
      if (!best || b.errors / b.total > best.errors / best.total) return b;
      return best;
    },
    null,
  );
  const hasErrors = peakErrorBucket !== null && peakErrorBucket.errors > 0;

  // Derive event type breakdown from context if analytics API hasn't loaded
  const eventTypes = analytics?.eventTypeBreakdown ??
    (stats?.byType?.map((t: any) => ({ type: t.type, _count: t._count })) ?? []);

  const toolBreakdown = analytics?.toolBreakdown ??
    (stats?.byTool?.map((t: any) => ({ toolName: t.toolName ?? "unknown", count: t._count ?? 0, errors: 0 })) ?? []);

  const toolData = toolBreakdown.map((t) => ({
    name: t.toolName ?? "unknown",
    success: Math.max(0, (t.count ?? 0) - (t.errors ?? 0)),
    errors: t.errors ?? 0,
    total: t.count ?? 0,
    errorRate: t.count ? (((t.errors ?? 0) / t.count) * 100).toFixed(1) : "0.0",
  }));

  const topErrorRateTools = [...toolData]
    .filter((t) => t.total > 0 && t.errors > 0)
    .sort((a, b) => parseFloat(b.errorRate) - parseFloat(a.errorRate))
    .slice(0, 3);

  const eventTypeData = (() => {
    const mapped = eventTypes
      .map((t: any) => ({
        name: TYPE_LABELS[t.type] ?? t.type,
        value: (t._count ?? t.count ?? 0) as number,
        type: t.type as string,
      }))
      .filter((t) => t.value > 0)
      .sort((a, b) => b.value - a.value);
    if (mapped.length <= 8) return mapped;
    const top = mapped.slice(0, 8);
    const otherValue = mapped.slice(8).reduce((sum, t) => sum + t.value, 0);
    if (otherValue > 0) top.push({ name: "Other", value: otherValue, type: "OTHER" });
    return top;
  })();
  const eventTypeTotal = eventTypeData.reduce((sum, t) => sum + t.value, 0);

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-white/[0.06]">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-white">Analytics</h1>
            <p className="text-xs text-white/30 mt-0.5 hidden sm:block">Trends and insights for OpenClaw activity</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 bg-white/[0.04] rounded-xl sm:rounded-lg p-1 sm:p-0.5">
              {[
                { value: "24" as const, label: "24h" },
                { value: "72" as const, label: "3d" },
                { value: "168" as const, label: "7d" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setTimeRange(opt.value)}
                  className={`px-4 sm:px-3 py-2.5 sm:py-1.5 rounded-lg sm:rounded-md text-sm sm:text-xs font-medium transition-colors min-h-[44px] sm:min-h-0 ${
                    timeRange === opt.value
                      ? "bg-white/10 text-white"
                      : "text-white/30 active:text-white/50 sm:hover:text-white/50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {lastUpdated && (
              <span className="hidden sm:block text-[10px] text-white/20 tabular-nums whitespace-nowrap">
                Updated {format(lastUpdated, "HH:mm:ss")}
              </span>
            )}
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="flex items-center justify-center w-11 h-11 sm:w-8 sm:h-8 rounded-xl sm:rounded-lg bg-white/[0.04] border border-white/[0.06] text-white/30 hover:text-white/60 hover:bg-white/[0.06] disabled:opacity-40 transition-colors"
            >
              <svg
                className={`w-4 h-4 sm:w-3.5 sm:h-3.5 ${loading ? "animate-spin" : ""}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 2v6h-6M3 12a9 9 0 0115-6.7L21 8M3 22v-6h6M21 12a9 9 0 01-15 6.7L3 16" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
        {loading && !timeline.length ? (
          <div className="flex items-center justify-center h-40">
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-white/10 border-t-blue-400 rounded-full animate-spin" />
              <span className="text-xs text-white/30">Loading analytics...</span>
            </div>
          </div>
        ) : (
          <>
            {/* Summary cards - 2x2 grid on mobile, 4-col on desktop */}
            {analytics && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <SummaryCard
                  label="Total Events"
                  value={analytics.errorRate.total.toLocaleString()}
                  color="blue"
                />
                <SummaryCard
                  label="Errors"
                  value={analytics.errorRate.errors.toLocaleString()}
                  sub={`${(analytics.errorRate.rate * 100).toFixed(1)}% rate`}
                  color="red"
                />
                <SummaryCard
                  label="Peak Hour"
                  value={analytics.peakHour && analytics.peakHour.count > 0 ? `${analytics.peakHour.hour}:00` : "—"}
                  sub={analytics.peakHour && analytics.peakHour.count > 0 ? `${analytics.peakHour.count} events` : "no data"}
                  color="yellow"
                />
                <SummaryCard
                  label="Avg Latency"
                  value={(stats as any)?.tokenStats?._avg?.durationMs ? `${Math.round((stats as any).tokenStats._avg.durationMs)}ms` : "—"}
                  color="green"
                />
              </div>
            )}

            {/* Timeline chart - scrollable on mobile */}
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <h3 className="text-sm font-semibold text-white/50 mb-4">
                Event Timeline
              </h3>
              {isMounted && timelineFormatted.length > 0 ? (
                <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                  <div className="min-w-[600px] sm:min-w-0">
                    <ResponsiveContainer width="100%" height={180} className="sm:!h-[240px]">
                      <ComposedChart data={timelineFormatted} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} onClick={handleTimelineBucketClick} style={{ cursor: "default" }}>
                        <defs>
                          <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                        <XAxis
                          dataKey="label"
                          tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          yAxisId="left"
                          tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                          width={40}
                        />
                        <YAxis
                          yAxisId="cost"
                          orientation="right"
                          tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 10 }}
                          tickFormatter={(v) => v > 0 ? `$${v.toFixed(3)}` : ""}
                          axisLine={false}
                          tickLine={false}
                          width={55}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Area
                          yAxisId="left"
                          type="monotone"
                          dataKey="total"
                          name="Total"
                          stroke="#3b82f6"
                          fill="url(#gradTotal)"
                          strokeWidth={1.5}
                        />
                        <Area
                          yAxisId="left"
                          type="monotone"
                          dataKey="tools"
                          name="Tool Calls"
                          stroke="#10b981"
                          fill="transparent"
                          strokeWidth={1}
                          strokeDasharray="4 2"
                        />
                        {/* Errors as Bar so we can dynamically colour spike buckets with Cell */}
                        <Bar yAxisId="left" dataKey="errors" name="Errors" maxBarSize={16} radius={[2, 2, 0, 0]} cursor="pointer">
                          {timelineFormatted.map((bucket, i) => {
                            const isSpike = bucket.total > 0 && bucket.errors / bucket.total > 0.1;
                            return (
                              <Cell
                                key={i}
                                fill={isSpike ? "#ef4444" : "rgba(239,68,68,0.4)"}
                                fillOpacity={isSpike ? 1 : 0.8}
                              />
                            );
                          })}
                        </Bar>
                        <Line
                          yAxisId="cost"
                          type="monotone"
                          dataKey="cost"
                          name="Est. Cost ($)"
                          stroke="#f59e0b"
                          strokeWidth={1.5}
                          strokeDasharray="6 2"
                          dot={false}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                    {/* Peak error rate summary */}
                    {hasErrors && peakErrorBucket && (
                      <div className="text-xs text-white/30 text-center mt-1">
                        Peak error rate:{" "}
                        {((peakErrorBucket.errors / peakErrorBucket.total) * 100).toFixed(1)}% at{" "}
                        {format(new Date(peakErrorBucket.time), "HH:mm")}
                      </div>
                    )}
                    {/* Timeline legend */}
                    <div className="flex items-center gap-4 mt-2 justify-end flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-[2px] rounded-sm inline-block bg-blue-500" />
                        <span className="text-[10px] text-white/30">Total</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-[2px] rounded-sm inline-block bg-emerald-500" />
                        <span className="text-[10px] text-white/30">Tool Calls</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-2 rounded-sm inline-block bg-red-500/70" />
                        <span className="text-[10px] text-white/30">Errors</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-[2px] rounded-sm inline-block" style={{ background: "#f59e0b" }} />
                        <span className="text-[10px] text-white/30">Est. Cost ($)</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-white/20 text-center py-10">No timeline data available</p>
              )}
            </div>

            {/* Two-column: Tool breakdown + Event types - stacked on mobile */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Tool breakdown - scrollable chart on mobile */}
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <h3 className="text-sm font-semibold text-white/50 mb-4">
                  Tool Usage ({timeRange}h)
                </h3>
                {isMounted && toolData.length > 0 ? (
                  <>
                    <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                      <div className="min-w-[300px] sm:min-w-0">
                        <ResponsiveContainer width="100%" height={Math.max(180, Math.min(toolData.length * 28, 300))}>
                          <ComposedChart
                            data={toolData}
                            layout="vertical"
                            margin={{ left: 0, right: 16, top: 0, bottom: 0 }}
                          >
                            <XAxis
                              type="number"
                              tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 10 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              type="category"
                              dataKey="name"
                              width={90}
                              tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="success" name="Successful" stackId="tool" fill="#3b82f6" fillOpacity={0.75} radius={[0, 0, 0, 0]} />
                            <Bar dataKey="errors" name="Errors" stackId="tool" fill="#ef4444" fillOpacity={0.85} radius={[0, 4, 4, 0]} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    {/* Legend */}
                    <div className="flex items-center gap-4 mt-2 justify-end">
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-2 rounded-sm inline-block bg-blue-500/75" />
                        <span className="text-[10px] text-white/30">Successful</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-2 rounded-sm inline-block bg-red-500/85" />
                        <span className="text-[10px] text-white/30">Errors</span>
                      </div>
                    </div>
                    {/* Top error rate tools */}
                    {topErrorRateTools.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-white/[0.06]">
                        <p className="text-[10px] text-white/30 mb-2 font-medium uppercase tracking-wider">Highest Error Rate</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {topErrorRateTools.map((t) => (
                            <div
                              key={t.name}
                              className="flex flex-col gap-0.5 p-2.5 rounded-lg bg-red-500/[0.04] border border-red-500/10 min-h-[52px]"
                            >
                              <span className="text-xs font-medium text-white/60 truncate">{t.name}</span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-bold text-red-400">{t.errorRate}%</span>
                                <span className="text-[10px] text-white/20">({t.errors} errors)</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-white/20 text-center py-6">No tool data</p>
                )}
              </div>

              {/* Event Type Distribution */}
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-5">
                <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-4">Event Type Distribution</h3>
                {isMounted && eventTypeData.length > 0 ? (
                  <>
                    {/* Mobile: horizontal bar chart (easier to read on small screens) */}
                    <div className="sm:hidden space-y-3">
                      {eventTypeData.map((t, i) => {
                        const pct = eventTypeTotal > 0 ? (t.value / eventTypeTotal) * 100 : 0;
                        return (
                          <div key={t.type} className="space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                                />
                                <span className="text-sm text-white/50 truncate">{t.name}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-sm font-mono text-white/30">{t.value.toLocaleString()}</span>
                                <span className="text-xs text-white/20 w-10 text-right">{pct.toFixed(1)}%</span>
                              </div>
                            </div>
                            <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length], opacity: 0.8 }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* Desktop: PieChart from recharts */}
                    <div className="hidden sm:flex items-center gap-4">
                      <div className="w-[180px] h-[180px] shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={eventTypeData}
                              cx="50%"
                              cy="50%"
                              innerRadius={40}
                              outerRadius={70}
                              paddingAngle={2}
                              dataKey="value"
                            >
                              {eventTypeData.map((_, i) => (
                                <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.85} />
                              ))}
                            </Pie>
                            <Tooltip
                              content={(props: any) => {
                                if (!props.active || !props.payload?.length) return null;
                                const d = props.payload[0]?.payload;
                                if (!d) return null;
                                const pct = eventTypeTotal > 0
                                  ? ((d.value / eventTypeTotal) * 100).toFixed(1)
                                  : "0.0";
                                return (
                                  <div className="bg-[#141420] border border-white/10 rounded-xl px-3 py-2 shadow-2xl">
                                    <p className="text-[10px] text-white/40 mb-1">{d.name}</p>
                                    <p className="text-xs text-white/70">
                                      Count:{" "}
                                      <span className="font-semibold text-white/90">{d.value.toLocaleString()}</span>
                                    </p>
                                    <p className="text-xs text-white/40">{pct}% of total</p>
                                  </div>
                                );
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex-1 space-y-1.5">
                        {eventTypeData.map((t, i) => {
                          const pct = eventTypeTotal > 0
                            ? ((t.value / eventTypeTotal) * 100).toFixed(1)
                            : "0.0";
                          return (
                            <div key={t.type} className="flex items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-sm shrink-0"
                                style={{ backgroundColor: COLORS[i % COLORS.length] }}
                              />
                              <span className="text-xs text-white/50 flex-1 truncate">{t.name}</span>
                              <span className="text-xs font-mono text-white/30">{t.value.toLocaleString()}</span>
                              <span className="text-[10px] text-white/20 w-9 text-right">{pct}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-white/20 text-center py-6">No event data</p>
                )}
              </div>
            </div>

            {/* Model breakdown */}
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-white/50">Model Usage (24h)</h3>
                <p className="text-[10px] text-white/25 mt-0.5">token distribution</p>
              </div>
              {isMounted && analytics?.modelBreakdown && analytics.modelBreakdown.length > 0 ? (
                <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                  <div className="min-w-[280px] sm:min-w-0">
                    <ResponsiveContainer width="100%" height={160} className="sm:!h-[200px]">
                      <BarChart
                        data={analytics.modelBreakdown.map((m, i) => ({
                          name: m.model?.split("/").pop() ?? "unknown",
                          totalTokens: (m.inputTokens ?? 0) + (m.outputTokens ?? 0),
                          inputTokens: m.inputTokens ?? 0,
                          outputTokens: m.outputTokens ?? 0,
                          cacheTokens: m.cacheTokens ?? 0,
                          count: m.count ?? m._count ?? 0,
                          colorIndex: i,
                        }))}
                        layout="vertical"
                        margin={{ left: 0, right: 16, top: 0, bottom: 0 }}
                      >
                        <XAxis
                          type="number"
                          tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={100}
                          tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip content={<ModelTooltip />} />
                        <Bar dataKey="totalTokens" name="Tokens" radius={[0, 4, 4, 0]} maxBarSize={24}>
                          {analytics.modelBreakdown.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.8} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-white/20 text-center py-6">No model data</p>
              )}
            </div>

            {/* Recent errors */}
            {events.filter((e) => e.status === "error" || e.error).length > 0 && (
              <div className="rounded-xl border border-red-500/10 bg-red-500/[0.02] p-4">
                <h3 className="text-sm font-semibold text-red-400/70 mb-3">
                  Recent Errors
                </h3>
                <div className="space-y-2">
                  {events
                    .filter((e) => e.status === "error" || e.error)
                    .slice(0, 10)
                    .map((e) => (
                      <div
                        key={e.id}
                        className="flex items-start gap-3 p-3 rounded-lg bg-red-500/[0.04] border border-red-500/[0.06] min-h-[52px]"
                      >
                        <span className="text-red-400 text-sm sm:text-xs mt-0.5 shrink-0">!</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm sm:text-xs text-white/50 font-medium">
                              {e.toolName ?? e.type}
                            </span>
                            <span className="text-xs sm:text-[10px] text-white/20 font-mono">
                              {e.sessionId.slice(0, 8)}
                            </span>
                          </div>
                          {e.error && (
                            <p className="text-xs sm:text-[11px] text-red-300/60 mt-0.5 truncate">{e.error}</p>
                          )}
                        </div>
                        <span className="text-xs sm:text-[10px] text-white/15 shrink-0 tabular-nums">
                          {format(new Date(e.timestamp), "HH:mm:ss")}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  const borderMap: Record<string, string> = {
    blue:   "border-l-blue-500/50   bg-blue-500/[0.04]   text-blue-300",
    red:    "border-l-red-500/50    bg-red-500/[0.04]    text-red-300",
    green:  "border-l-green-500/50  bg-green-500/[0.04]  text-green-300",
    purple: "border-l-purple-500/50 bg-purple-500/[0.04] text-purple-300",
    yellow: "border-l-yellow-500/50 bg-yellow-500/[0.04] text-yellow-300",
  };
  return (
    <div className={`rounded-xl border border-white/[0.06] border-l-2 p-3 ${borderMap[color]}`}>
      <div className="text-[11px] sm:text-[10px] text-white/30 font-medium mb-1">{label}</div>
      <div className="text-2xl sm:text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-[11px] sm:text-[10px] text-white/20 mt-0.5">{sub}</div>}
    </div>
  );
}
