"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface ToolData {
  toolName: string | null;
  _count: number;
}

const COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#f97316",
  "#6366f1",
];
const TOOL_ICONS: Record<string, string> = {
  exec: "⚡",
  browser: "🌐",
  edit: "✏️",
  read: "📖",
  write: "📝",
  web_search: "🔍",
  memory_search: "🧠",
  message: "💬",
  cron: "⏰",
  sessions_spawn: "🤖",
};

export function ToolChart({ data }: { data: ToolData[] }) {
  const chartData = data.map((d) => ({
    name: d.toolName ?? "unknown",
    count: d._count,
    icon: TOOL_ICONS[d.toolName ?? ""] ?? "📌",
  }));

  return (
    <div className="rounded-xl border border-white/5 bg-white/3 p-4">
      <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">
        Top Tools (24h)
      </h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 20 }}>
          <XAxis
            type="number"
            tick={{ fill: "#ffffff30", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: "#ffffff60", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={90}
            tickFormatter={(v) => `${TOOL_ICONS[v] ?? "📌"} ${v}`}
          />
          <Tooltip
            contentStyle={{
              background: "#1a1a2e",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "#fff" }}
            itemStyle={{ color: "#94a3b8" }}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {chartData.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
