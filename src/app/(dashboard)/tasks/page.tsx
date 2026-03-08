"use client";

import React, { useState, useCallback } from "react";
import { formatDistanceToNow, format } from "date-fns";
import Link from "next/link";
import { useDashboard } from "../layout";

// ── Types ────────────────────────────────────────────────────────────────────

interface TaskSummary {
  taskId: string;
  sessionId: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  totalEvents: number;
  toolCalls: number;
  llmCalls: number;
  errors: number;
  subAgents: number;
  triggerType: string;
  triggerPreview: string | null;
}

interface TaskEvent {
  id: string;
  type: string;
  toolName?: string | null;
  timestamp: string;
  durationMs?: number | null;
  status?: string | null;
  error?: string | null;
  subAgentId?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface SubAgentData {
  session: { id: string; key?: string | null };
  events: TaskEvent[];
}

interface TaskDetail {
  taskId: string;
  events: TaskEvent[];
  subAgentData: Record<string, SubAgentData>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const TRIGGER_ICONS: Record<string, string> = {
  user_message: "💬",
  cron:         "⏰",
  heartbeat:    "💓",
  subagent:     "🤖",
  agent:        "🤖",
  unknown:      "❓",
};

const TRIGGER_COLORS: Record<string, string> = {
  user_message: "border-l-sky-500/60 bg-sky-500/[0.04]",
  cron:         "border-l-yellow-500/60 bg-yellow-500/[0.04]",
  heartbeat:    "border-l-pink-500/60 bg-pink-500/[0.04]",
  subagent:     "border-l-purple-500/60 bg-purple-500/[0.04]",
  agent:        "border-l-purple-500/60 bg-purple-500/[0.04]",
  unknown:      "border-l-white/20",
};

const EVENT_ICONS: Record<string, string> = {
  TOOL_CALL:         "🔧",
  LLM_OUTPUT:        "✨",
  MESSAGE_RECEIVED:  "📨",
  MESSAGE_SENT:      "📤",
  MESSAGE_SEND:      "📤",
  AGENT_SPAWN:       "🤖",
  AGENT_START:       "▶️",
  AGENT_END:         "⏹️",
  SUBAGENT_SPAWNING: "🚀",
  SUBAGENT_ENDED:    "✅",
  CRON_RUN:          "⏰",
  SESSION_START:     "🟢",
  SESSION_END:       "⚫",
  ERROR:             "❌",
};

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

// ── EventRow ─────────────────────────────────────────────────────────────────

function EventRow({ event, depth = 0 }: { event: TaskEvent; depth?: number }) {
  const isError = event.status === "error" || !!event.error;
  const isSpawn = event.type === "AGENT_SPAWN";
  const icon = event.toolName === "llm_call" ? "✨" : (EVENT_ICONS[event.type] ?? "▪️");

  // Try to get analysis label from metadata
  const analysis = (event.metadata as any)?.toolAnalysis;
  const label = analysis?.label ?? event.toolName ?? event.type.toLowerCase().replace(/_/g, " ");

  return (
    <div
      className={`flex items-start gap-2 py-1.5 px-2 rounded text-[11px] ${
        isError ? "bg-red-500/[0.06]" : "hover:bg-white/[0.02]"
      }`}
      style={{ paddingLeft: `${8 + depth * 20}px` }}
    >
      {/* Connector line for depth */}
      {depth > 0 && (
        <span className="shrink-0 text-white/15 mt-0.5 font-mono">└</span>
      )}

      <span className="shrink-0 mt-0.5">{icon}</span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {analysis?.icon && analysis.icon !== icon && (
            <span className="text-sm shrink-0">{analysis.icon}</span>
          )}
          <span className={`font-mono ${isError ? "text-red-300/80" : "text-white/75"} truncate`}>
            {label}
          </span>

          {/* Risk badge */}
          {analysis?.risk && analysis.risk !== "low" && (
            <span className={`px-1 py-0.5 rounded text-[8px] font-bold uppercase border shrink-0 ${
              analysis.risk === "critical" ? "bg-red-500/20 text-red-300 border-red-500/30" :
              analysis.risk === "high"     ? "bg-orange-500/20 text-orange-300 border-orange-500/30" :
                                             "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"
            }`}>{analysis.risk}</span>
          )}

          {/* Secret badge */}
          {analysis?.hasSecrets && (
            <span className="px-1 py-0.5 rounded text-[8px] font-bold border bg-red-600/25 text-red-300 border-red-500/40 animate-pulse shrink-0">
              🔑 SECRET
            </span>
          )}

          {isSpawn && event.subAgentId && (
            <Link
              href={`/sessions/${event.subAgentId}`}
              className="text-purple-400/60 hover:text-purple-300 transition-colors text-[9px] font-mono shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              → sub-session
            </Link>
          )}
        </div>

        {isError && event.error && (
          <div className="text-[10px] text-red-400/60 mt-0.5 truncate">{event.error}</div>
        )}
      </div>

      {/* Duration */}
      <span className="shrink-0 tabular-nums text-[10px] text-white/20 mt-0.5">
        {event.durationMs != null ? fmtDuration(event.durationMs) : ""}
      </span>

      {/* Time */}
      <span className="shrink-0 tabular-nums text-[10px] text-white/15 mt-0.5 font-mono">
        {format(new Date(event.timestamp), "HH:mm:ss")}
      </span>
    </div>
  );
}

// ── TaskCard ──────────────────────────────────────────────────────────────────

function TaskCard({ task }: { task: TaskSummary }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const toggle = useCallback(async () => {
    if (!expanded && !detail) {
      setLoading(true);
      try {
        const res = await fetch(`/api/tasks/${task.taskId}`);
        if (res.ok) setDetail(await res.json());
      } finally {
        setLoading(false);
      }
    }
    setExpanded((v) => !v);
  }, [expanded, detail, task.taskId]);

  const trigType = task.triggerType ?? "unknown";
  const borderColor = TRIGGER_COLORS[trigType] ?? TRIGGER_COLORS.unknown;

  return (
    <div className={`border border-white/[0.06] border-l-2 rounded-lg overflow-hidden ${borderColor}`}>
      {/* Header */}
      <button
        onClick={toggle}
        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors text-left"
      >
        {/* Expand arrow */}
        <svg
          className={`w-3.5 h-3.5 mt-1 shrink-0 transition-transform text-white/30 ${expanded ? "rotate-90" : ""}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        >
          <polyline points="9,18 15,12 9,6" />
        </svg>

        {/* Trigger icon */}
        <span className="text-xl shrink-0 mt-0.5">
          {TRIGGER_ICONS[trigType] ?? "❓"}
        </span>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap justify-end mb-1">
            <span className="text-[10px] text-white/30 uppercase tracking-wide font-medium">
              {trigType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
            </span>
            {task.errors > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/20 text-red-300 border border-red-500/30">
                {task.errors} error{task.errors > 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Preview */}
          {task.triggerPreview && (() => {
            const preview = task.triggerPreview!
              .replace(/^\[[\w :,\-.]+UTC\] OpenClaw runtime context[^]*/, "")
              .replace(/^\[cron:[0-9a-f-]+ ([^\]]+)\]/, "$1")
              .trim().slice(0, 100);
            return preview ? (
              <div className="text-xs text-white/60 truncate mb-2">{preview}</div>
            ) : null;
          })()}

          {/* Stats row */}
          <div className="flex items-center gap-3 flex-wrap justify-end text-[10px] text-white/30 font-mono">
            <span>{task.totalEvents} {task.totalEvents === 1 ? 'event' : 'events'}</span>
            {task.toolCalls > 0 && <span>🔧 {task.toolCalls} tools</span>}
            {task.llmCalls > 0  && <span>✨ {task.llmCalls} llm</span>}
            {task.subAgents > 0 && <span>🤖 {task.subAgents} sub-agents</span>}
            <span>⏱ {fmtDuration(task.durationMs)}</span>
          </div>
        </div>

        {/* Time */}
        <div className="shrink-0 text-[10px] text-white/25 font-mono">
          <div>{format(new Date(task.startedAt), "HH:mm:ss")}</div>
          <div className="text-white/15 mt-0.5">
            {formatDistanceToNow(new Date(task.startedAt), { addSuffix: true })}
          </div>
        </div>
      </button>

      {/* Expanded event tree */}
      {expanded && (
        <div className="border-t border-white/[0.05] px-2 py-2">
          {loading && (
            <div className="text-center py-4 text-xs text-white/30 animate-pulse">Loading events…</div>
          )}
          {detail && (
            <div>
              {detail.events.map((ev) => {
                const isSpawn = ev.type === "AGENT_SPAWN" && ev.subAgentId;
                const childKey = ev.subAgentId ?? "";
                const childData = detail.subAgentData[childKey];

                return (
                  <div key={ev.id}>
                    <EventRow event={ev} />
                    {/* Inline sub-agent events */}
                    {isSpawn && childData && (
                      <div className="ml-4 border-l border-purple-500/20 pl-2 my-1">
                        <div className="text-[9px] text-purple-400/50 uppercase tracking-wider font-medium px-2 py-1">
                          🤖 Sub-agent: {childData.session.key?.split(":").pop() ?? childData.session.id.slice(0, 8)}
                        </div>
                        {childData.events.map((ce) => (
                          <EventRow key={ce.id} event={ce} depth={1} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TasksPage() {
  useDashboard(); // keep context subscription
  const [tasks, setTasks] = useState<TaskSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [Filter, setFilter] = useState<"all" | "user_message" | "cron" | "heartbeat" | "subagent">("all");

  const loadTasks = useCallback(async () => {
    if (loaded) return;
    setLoading(true);
    try {
      const res = await fetch("/api/tasks?limit=100");
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks ?? []);
        setLoaded(true);
      }
    } finally {
      setLoading(false);
    }
  }, [loaded]);

  // Auto-load on mount
  React.useEffect(() => { loadTasks(); }, [loadTasks]);

  const filtered = tasks?.filter((t) =>
    Filter === "all" ? true : t.triggerType === Filter
  ) ?? [];

  const counts = tasks ? {
    user_message: tasks.filter((t) => t.triggerType === "user_message").length,
    cron:         tasks.filter((t) => t.triggerType === "cron").length,
    heartbeat:    tasks.filter((t) => t.triggerType === "heartbeat").length,
    subagent:     tasks.filter((t) => t.triggerType === "subagent" || t.triggerType === "agent").length,
  } : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-white/[0.06]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-white/90">Tasks</h1>
            <p className="text-xs text-white/40 mt-0.5">
              Every agent run grouped by what triggered it
            </p>
          </div>
          {tasks && (
            <span className="text-sm text-white/30 font-mono">{tasks.length} tasks</span>
          )}
        </div>

        {/* Filter tabs */}
        {counts && (
          <div className="flex gap-1 mt-3 flex-wrap">
            {(["all", "user_message", "cron", "heartbeat", "subagent"] as const).map((f) => {
              const label = f === "all" ? "All" : f === "user_message" ? "💬 User" : f === "cron" ? "⏰ Cron" : f === "heartbeat" ? "💓 Heartbeat" : "🤖 Agent";
              const count = f === "all" ? tasks!.length : (counts as any)[f] ?? 0;
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                    Filter === f
                      ? "bg-white/10 text-white border-white/20"
                      : "text-white/40 border-white/10 hover:text-white/60"
                  }`}
                >
                  {label} <span className="opacity-50 ml-1">{count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-2">
        {loading && (
          <div className="flex items-center justify-center h-32 text-sm text-white/30 animate-pulse">
            Loading tasks…
          </div>
        )}

        {!loading && loaded &&filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-sm text-white/30 gap-2">
            <span className="text-3xl">📭</span>
            <span>No tasks yet</span>
            <span className="text-[11px] text-white/20">
              Tasks appear after the plugin is updated and the gateway is restarted
            </span>
          </div>
        )}

        {filtered.map((task) => (
          <TaskCard key={task.taskId} task={task} />
        ))}
      </div>
    </div>
  );
}
