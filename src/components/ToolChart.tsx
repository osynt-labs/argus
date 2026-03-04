"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface ToolData { toolName: string | null; _count: number }

const COLORS = ["#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444","#06b6d4","#ec4899","#84cc16"];
const TOOL_ICONS: Record<string, string> = {
  exec:"⚡", browser:"🌐", edit:"✏️", read:"📖", write:"📝",
  web_search:"🔍", memory_search:"🧠", message:"💬", cron:"⏰", sessions_spawn:"🤖",
};

export function ToolChart({ data }: { data: ToolData[] }) {
  const chartData = data.map((d) => ({
    name: d.toolName ?? "unknown",
    count: d._count,
  }));

  if (chartData.length === 0) {
    return (
      <div className="rounded-xl border border-white/5 bg-white/2 p-4">
        <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Top Tools (24h)</h3>
        <p className="text-xs text-white/20 text-center py-6">No data yet</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/5 bg-white/2 p-4">
      <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-4">Top Tools (24h)</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 4, right: 24, top: 0, bottom: 0 }}>
          <XAxis
            type="number"
            tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 10 }}
            axisLine={false} tickLine={false}
          />
          <YAxis
            type="category" dataKey="name" width={80}
            tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }}
            axisLine={false} tickLine={false}
            tickFormatter={(v) => `${TOOL_ICONS[v] ?? "📌"} ${v}`}
          />
          <Tooltip
            contentStyle={{
              background: "#141420", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10, fontSize: 12, color: "#fff",
            }}
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.8} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
