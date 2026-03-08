"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { format, intervalToDuration } from "date-fns";

interface SessionEvent {
  id: string;
  type: string;
  toolName?: string | null;
  sessionId: string;
  subAgentId?: string | null;
  timestamp: string;
  durationMs?: number | null;
  status?: string | null;
  error?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cacheTokens?: number | null;
  costUsd?: number | null;
  model?: string | null;
  input?: unknown;
  output?: unknown;
  metadata?: unknown;
}

interface Turn {
  id: string;
  receivedEvent: SessionEvent | null;
  sentEvent: SessionEvent | null;
  events: SessionEvent[]; // all events between received and sent
  startTime: string;
  endTime: string;
  durationMs: number;
  toolCount: number;
  errorCount: number;
  llmCount: number;
  spawnCount: number;
}

interface SessionDetail {
  id: string;
  key?: string | null;
  agentId?: string | null;
  model?: string | null;
  label?: string | null;
  startedAt?: string;
  lastSeenAt: string;
  totalEvents: number;
  totalTokens: number;
  totalErrors: number;
  events: SessionEvent[];
}

interface SessionSummary {
  eventCount: number;
  errorCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheTokens: number;
  totalCostUsd?: number;
}

type FilterType = "all" | "tools" | "llm" | "errors";
type ViewMode = "turns" | "timeline";

const TYPE_ICONS: Record<string, string> = {
  SESSION_START: "🟢",
  SESSION_END: "🔴",
  AGENT_START: "🤖",
  AGENT_END: "✅",
  MESSAGE_RECEIVED: "📨",
  MESSAGE_SENT: "📤",
  TOOL_CALL: "⚡",
  MESSAGE_SEND: "📤",
  AGENT_SPAWN: "🚀",
  LLM_OUTPUT: "🧠",
  CRON_RUN: "⏰",
  ERROR: "❌",
  MODEL_SWITCH: "🔄",
  SUBAGENT_SPAWNING: "🤖",
  SUBAGENT_ENDED: "🏁",
};

const TYPE_COLORS: Record<string, string> = {
  TOOL_CALL: "bg-blue-500/20 text-blue-300 border-blue-500/20",
  MESSAGE_SEND: "bg-violet-500/20 text-violet-300 border-violet-500/20",
  MESSAGE_SENT: "bg-violet-500/20 text-violet-300 border-violet-500/20",
  MESSAGE_RECEIVED: "bg-emerald-500/20 text-emerald-300 border-emerald-500/20",
  AGENT_SPAWN: "bg-cyan-500/20 text-cyan-300 border-cyan-500/20",
  AGENT_START: "bg-cyan-500/20 text-cyan-300 border-cyan-500/20",
  AGENT_END: "bg-cyan-500/20 text-cyan-300 border-cyan-500/20",
  LLM_OUTPUT: "bg-violet-500/20 text-violet-300 border-violet-500/20",
  CRON_RUN: "bg-amber-500/20 text-amber-300 border-amber-500/20",
  ERROR: "bg-red-500/20 text-red-300 border-red-500/20",
  SESSION_START: "bg-emerald-500/20 text-emerald-300 border-emerald-500/20",
  SESSION_END: "bg-zinc-500/20 text-zinc-300 border-zinc-500/20",
  MODEL_SWITCH: "bg-pink-500/20 text-pink-300 border-pink-500/20",
  SUBAGENT_SPAWNING: "bg-orange-500/20 text-orange-300 border-orange-500/20",
  SUBAGENT_ENDED: "bg-amber-500/20 text-amber-300 border-amber-500/20",
};

const TYPE_LABELS: Record<string, string> = {
  TOOL_CALL: "Tool",
  MESSAGE_SEND: "Sent",
  MESSAGE_SENT: "Sent",
  MESSAGE_RECEIVED: "Received",
  AGENT_SPAWN: "Spawn",
  AGENT_START: "Agent Start",
  AGENT_END: "Agent End",
  LLM_OUTPUT: "LLM",
  CRON_RUN: "Cron",
  ERROR: "Error",
  SESSION_START: "Start",
  SESSION_END: "End",
  MODEL_SWITCH: "Switch",
  SUBAGENT_SPAWNING: "Sub-agent Start",
  SUBAGENT_ENDED: "Sub-agent End",
};

function formatDuration(startedAt?: string, lastSeenAt?: string): string {
  if (!startedAt || !lastSeenAt) return "--";
  const dur = intervalToDuration({ start: new Date(startedAt), end: new Date(lastSeenAt) });
  const parts: string[] = [];
  if (dur.days) parts.push(`${dur.days}d`);
  if (dur.hours) parts.push(`${dur.hours}h`);
  if (dur.minutes) parts.push(`${dur.minutes}m`);
  if (dur.seconds) parts.push(`${dur.seconds}s`);
  return parts.length ? parts.join(" ") : "0s";
}

function formatMs(ms?: number | null): string {
  if (ms == null) return "--";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTokens(n?: number | null): string {
  if (n == null || n === 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function isLlmCall(event: SessionEvent): boolean {
  return (
    event.type === "LLM_OUTPUT" ||
    event.toolName === "llm_call" ||
    event.toolName === "llm" ||
    (event.type === "TOOL_CALL" && (event.inputTokens ?? 0) > 0 && (event.outputTokens ?? 0) > 0)
  );
}

function hasEventError(event: SessionEvent): boolean {
  return event.status === "error" || event.type === "ERROR" || !!event.error;
}

function getMessagePreview(event: SessionEvent): string | null {
  if (event.type !== "MESSAGE_RECEIVED" && event.type !== "MESSAGE_SENT" && event.type !== "MESSAGE_SEND") return null;
  const meta = event.metadata as Record<string, unknown> | null;
  if (!meta) return null;
  const preview = meta.content_preview ?? meta.prompt_preview ?? meta.content ?? meta.text;
  if (typeof preview === "string" && preview.length > 0)
    return preview.length > 120 ? preview.slice(0, 120) + "…" : preview;
  return null;
}

// ─── Turn Card ─────────────────────────────────────────────────────────────
function TurnCard({ turn, turnIndex, maxDuration }: { turn: Turn; turnIndex: number; maxDuration: number }) {
  const [expanded, setExpanded] = useState(false);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  const userMsg = getMessagePreview(turn.receivedEvent!) ?? turn.receivedEvent?.metadata
    ? (() => {
        const meta = turn.receivedEvent?.metadata as Record<string, unknown> | null;
        const p = meta?.content_preview ?? meta?.prompt_preview;
        return typeof p === "string" ? p : null;
      })()
    : null;

  const responseMsg = turn.sentEvent ? getMessagePreview(turn.sentEvent) : null;
  const hasErrors = turn.errorCount > 0;

  return (
    <div className={`rounded-xl border ${hasErrors ? "border-red-500/20" : "border-white/[0.07]"} bg-white/[0.02] overflow-hidden`}>
      {/* Turn Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-4 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-start gap-3">
          {/* Turn number */}
          <div className="shrink-0 w-7 h-7 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-[11px] font-mono text-white/40 mt-0.5">
            {turnIndex + 1}
          </div>

          <div className="flex-1 min-w-0">
            {/* User message */}
            {userMsg ? (
              <div className="flex items-start gap-2 mb-2">
                <span className="text-emerald-400/70 text-sm shrink-0">📨</span>
                <p className="text-[13px] text-white/70 leading-relaxed line-clamp-2">{userMsg}</p>
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-2">
                <span className="text-white/20 text-sm">📨</span>
                <span className="text-[12px] text-white/25 italic">message received</span>
              </div>
            )}

            {/* Stats row */}
            <div className="flex items-center gap-3 flex-wrap">
              {turn.toolCount > 0 && (
                <span className="text-[11px] text-blue-300/60 bg-blue-500/10 border border-blue-500/10 px-2 py-0.5 rounded-full">
                  ⚡ {turn.toolCount} tool{turn.toolCount > 1 ? "s" : ""}
                </span>
              )}
              {turn.llmCount > 0 && (
                <span className="text-[11px] text-violet-300/60 bg-violet-500/10 border border-violet-500/10 px-2 py-0.5 rounded-full">
                  🧠 {turn.llmCount} LLM
                </span>
              )}
              {turn.spawnCount > 0 && (
                <span className="text-[11px] text-cyan-300/60 bg-cyan-500/10 border border-cyan-500/10 px-2 py-0.5 rounded-full">
                  🚀 {turn.spawnCount} sub-agent{turn.spawnCount > 1 ? "s" : ""}
                </span>
              )}
              {hasErrors && (
                <span className="text-[11px] text-red-300/60 bg-red-500/10 border border-red-500/10 px-2 py-0.5 rounded-full">
                  ❌ {turn.errorCount} error{turn.errorCount > 1 ? "s" : ""}
                </span>
              )}
              {turn.durationMs > 0 && (
                <span className="text-[11px] text-white/25 font-mono ml-auto">
                  {formatMs(turn.durationMs)}
                </span>
              )}
            </div>

            {/* Response preview */}
            {responseMsg && (
              <div className="flex items-start gap-2 mt-2 pt-2 border-t border-white/[0.04]">
                <span className="text-violet-400/60 text-sm shrink-0">📤</span>
                <p className="text-[12px] text-white/35 leading-relaxed line-clamp-2 italic">{responseMsg}</p>
              </div>
            )}
          </div>

          {/* Expand chevron */}
          <svg
            className={`w-4 h-4 text-white/20 shrink-0 mt-0.5 transition-transform ${expanded ? "rotate-90" : ""}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          >
            <polyline points="9,18 15,12 9,6" />
          </svg>
        </div>
      </button>

      {/* Expanded: event timeline */}
      {expanded && (
        <div className="border-t border-white/[0.05] px-3 pb-3 pt-2">
          <div className="relative">
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-white/[0.04]" />
            <div className="space-y-0.5">
              {[...(turn.receivedEvent ? [turn.receivedEvent] : []), ...turn.events, ...(turn.sentEvent ? [turn.sentEvent] : [])].map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  isExpanded={expandedEvent === event.id}
                  onToggle={() => setExpandedEvent(expandedEvent === event.id ? null : event.id)}
                  maxDuration={maxDuration}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Event Row ─────────────────────────────────────────────────────────────
function EventRow({
  event,
  isExpanded,
  onToggle,
  maxDuration,
}: {
  event: SessionEvent;
  isExpanded: boolean;
  onToggle: () => void;
  maxDuration: number;
}) {
  const hasError = hasEventError(event);
  const isLlm = isLlmCall(event);
  const messagePreview = getMessagePreview(event);
  const icon = TYPE_ICONS[event.type] ?? "•";
  const typeColor = TYPE_COLORS[event.type] ?? "bg-white/10 text-white/50 border-white/10";
  const barWidth = event.durationMs ? ((event.durationMs / maxDuration) * 100).toFixed(1) + "%" : "0%";
  const isSpawn = event.type === "AGENT_SPAWN";

  const dotColor = hasError
    ? "bg-red-500 border-red-500/50"
    : event.type === "SESSION_START" ? "bg-emerald-500 border-emerald-500/50"
    : event.type === "SESSION_END" ? "bg-zinc-500 border-zinc-500/50"
    : event.type === "AGENT_START" || event.type === "AGENT_END" ? "bg-cyan-500 border-cyan-500/50"
    : isLlm ? "bg-violet-500 border-violet-500/50"
    : isSpawn ? "bg-cyan-400 border-cyan-400/50"
    : "bg-white/20 border-white/10";

  return (
    <div className="relative">
      <div className={`absolute left-[3px] top-4 w-[9px] h-[9px] rounded-full border-2 z-10 ${dotColor}`} />

      <button
        onClick={onToggle}
        className={`w-full text-left pl-6 pr-2 py-2 min-h-[40px] rounded-lg transition-colors ${
          hasError
            ? "border-l-2 border-red-500/30 bg-red-500/[0.02] ml-[2px] pl-[22px]"
            : isExpanded ? "bg-white/[0.04]" : "hover:bg-white/[0.02]"
        }`}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-mono text-white/25 tabular-nums w-[52px] shrink-0">
            {format(new Date(event.timestamp), "HH:mm:ss")}
          </span>
          <span className="text-sm">{icon}</span>

          {isLlm ? (
            <span className="text-[10px] font-medium text-violet-300">LLM</span>
          ) : (
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${typeColor}`}>
              {TYPE_LABELS[event.type] ?? event.type}
            </span>
          )}

          {event.toolName && !isLlm && (
            <span className="text-[11px] font-mono text-white/50 truncate max-w-[140px]">
              {event.toolName}
            </span>
          )}
          {(event.type === "AGENT_START" || isLlm) && event.model && (
            <span className="text-[10px] text-white/25">{event.model.split("/").pop()}</span>
          )}

          <div className="flex-1 min-w-0" />

          {/* Sub-agent link */}
          {isSpawn && event.subAgentId && (
            <Link
              href={`/sessions/${encodeURIComponent(event.subAgentId)}`}
              onClick={(e) => e.stopPropagation()}
              className="text-[10px] text-cyan-400/70 hover:text-cyan-400 border border-cyan-500/20 hover:border-cyan-500/40 px-2 py-0.5 rounded transition-colors flex items-center gap-1"
            >
              View sub-agent
              <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="7" y1="17" x2="17" y2="7" /><polyline points="7,7 17,7 17,17" />
              </svg>
            </Link>
          )}

          {/* Cost badge for non-LLM events */}
          {!isLlm && event.costUsd != null && event.costUsd > 0 && (
            <span className="text-[10px] text-amber-400/70">💰${event.costUsd.toFixed(4)}</span>
          )}

          {event.durationMs != null && event.durationMs > 0 && (
            <div className="hidden sm:flex items-center gap-2 w-[90px]">
              <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className={`h-full rounded-full ${isLlm ? "bg-violet-400/50" : isSpawn ? "bg-cyan-400/50" : "bg-blue-400/50"}`}
                  style={{ width: barWidth }}
                />
              </div>
              <span className="text-[10px] font-mono text-white/30 tabular-nums w-[38px] text-right">
                {formatMs(event.durationMs)}
              </span>
            </div>
          )}

          <svg
            className={`w-3 h-3 text-white/15 transition-transform shrink-0 ${isExpanded ? "rotate-90" : ""}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          >
            <polyline points="9,18 15,12 9,6" />
          </svg>
        </div>

        {isLlm && (
          <div className="mt-1.5 ml-[60px]">
            <div className="bg-violet-500/5 border border-violet-500/10 rounded-lg p-2">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-white/40">
                <span>↓ {formatTokens(event.inputTokens)} in</span>
                <span>↑ {formatTokens(event.outputTokens)} out</span>
                {(event.cacheTokens ?? 0) > 0 && (
                  <span className="text-amber-300/50">💾 {formatTokens(event.cacheTokens)} cache</span>
                )}
                {event.costUsd != null && event.costUsd > 0 && (
                  <span className="text-amber-400/70">💰${event.costUsd.toFixed(4)}</span>
                )}
              </div>
            </div>
          </div>
        )}

        {messagePreview && (
          <div className="mt-1 ml-[60px] text-[11px] text-white/30 italic line-clamp-2">"{messagePreview}"</div>
        )}
        {event.error && !isExpanded && (
          <div className="mt-1 ml-[60px] text-[11px] text-red-300/60 truncate">{event.error}</div>
        )}
      </button>

      {isExpanded && (
        <div className="mt-1 ml-6 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            <div>
              <span className="text-white/25 block">Event ID</span>
              <span className="font-mono text-white/50 text-[10px]">{event.id.slice(0, 16)}…</span>
            </div>
            {event.subAgentId && (
              <div>
                <span className="text-white/25 block">Sub-agent</span>
                <Link
                  href={`/sessions/${encodeURIComponent(event.subAgentId)}`}
                  className="font-mono text-cyan-400/70 hover:text-cyan-400 text-[10px] truncate block"
                >
                  {event.subAgentId.split(":").slice(-1)[0]}
                </Link>
              </div>
            )}
            <div>
              <span className="text-white/25 block">Status</span>
              <span className={event.status === "error" ? "text-red-400" : "text-white/50"}>
                {event.status ?? "--"}
              </span>
            </div>
            <div>
              <span className="text-white/25 block">Duration</span>
              <span className="font-mono text-white/50">{formatMs(event.durationMs)}</span>
            </div>
            <div>
              <span className="text-white/25 block">Timestamp</span>
              <span className="font-mono text-white/50 text-[10px]">
                {format(new Date(event.timestamp), "HH:mm:ss.SSS")}
              </span>
            </div>
            {event.model && (
              <div>
                <span className="text-white/25 block">Model</span>
                <span className="text-white/50">{event.model.split("/").pop()}</span>
              </div>
            )}
            {event.inputTokens != null && (
              <div>
                <span className="text-white/25 block">In tokens</span>
                <span className="font-mono text-white/50">{event.inputTokens.toLocaleString()}</span>
              </div>
            )}
            {event.outputTokens != null && (
              <div>
                <span className="text-white/25 block">Out tokens</span>
                <span className="font-mono text-white/50">{event.outputTokens.toLocaleString()}</span>
              </div>
            )}
          </div>

          {event.input != null && (
            <div>
              <span className="text-[10px] text-white/25 uppercase tracking-wider font-semibold block mb-1">Input</span>
              <pre className="text-[11px] text-white/40 bg-black/30 rounded-lg p-3 overflow-x-auto max-h-60 leading-relaxed whitespace-pre-wrap break-words">
                {typeof event.input === "string" ? event.input : JSON.stringify(event.input, null, 2)}
              </pre>
            </div>
          )}
          {event.output != null && (
            <div>
              <span className="text-[10px] text-white/25 uppercase tracking-wider font-semibold block mb-1">Output</span>
              <pre className="text-[11px] text-white/40 bg-black/30 rounded-lg p-3 overflow-x-auto max-h-60 leading-relaxed whitespace-pre-wrap break-words">
                {typeof event.output === "string" ? event.output : JSON.stringify(event.output, null, 2)}
              </pre>
            </div>
          )}
          {event.error && (
            <div>
              <span className="text-[10px] text-red-400/40 uppercase tracking-wider font-semibold block mb-1">Error</span>
              <pre className="text-[11px] text-red-300/50 bg-red-500/[0.04] border border-red-500/10 rounded-lg p-3 overflow-x-auto max-h-40 leading-relaxed">
                {event.error}
              </pre>
            </div>
          )}
          {event.metadata != null && (
            <div>
              <span className="text-[10px] text-white/25 uppercase tracking-wider font-semibold block mb-1">Metadata</span>
              <pre className="text-[11px] text-white/30 bg-black/30 rounded-lg p-3 overflow-x-auto max-h-40 leading-relaxed">
                {typeof event.metadata === "string" ? event.metadata : JSON.stringify(event.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Stat Pill ──────────────────────────────────────────────────────────────
function StatPill({ label, value, color, className = "" }: { label: string; value: string; color: string; className?: string }) {
  const colorMap: Record<string, string> = {
    blue: "text-blue-300", red: "text-red-400", violet: "text-violet-300",
    green: "text-emerald-300", amber: "text-amber-300", zinc: "text-white/30",
  };
  return (
    <div className={`rounded-lg bg-white/[0.03] border border-white/[0.05] px-3 py-2 ${className}`}>
      <div className="text-[10px] text-white/25 uppercase tracking-wider">{label}</div>
      <div className={`text-base font-semibold font-mono tabular-nums mt-0.5 ${colorMap[color] ?? "text-white/50"}`}>{value}</div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────
export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("turns");

  // Pagination state
  const [eventCount, setEventCount] = useState<number>(0);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [additionalEvents, setAdditionalEvents] = useState<SessionEvent[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setAdditionalEvents([]);
    fetch(`/api/sessions/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "Session not found" : "Failed to load");
        return r.json();
      })
      .then((data) => {
        setSession(data.session);
        setSummary(data.summary);
        setEventCount(data.eventCount ?? 0);
        setHasMore(data.hasMore ?? false);
        setNextCursor(data.nextCursor ?? null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const loadMoreEvents = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await fetch(`/api/sessions/${id}?cursor=${encodeURIComponent(nextCursor)}`);
      if (!r.ok) throw new Error("Failed to load more events");
      const data = await r.json();
      setAdditionalEvents((prev) => [...prev, ...(data.events as SessionEvent[])]);
      setHasMore(data.hasMore ?? false);
      setNextCursor(data.nextCursor ?? null);
    } catch (err) {
      console.error("[loadMoreEvents]", err);
    } finally {
      setLoadingMore(false);
    }
  };

  // Chronological events (initial load + paginated older events combined)
  const timelineEvents = useMemo(() => {
    if (!session?.events) return [];
    const combined = [...session.events, ...additionalEvents];
    return combined.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [session, additionalEvents]);

  const maxDuration = useMemo(
    () => Math.max(...timelineEvents.map((e) => e.durationMs ?? 0), 1),
    [timelineEvents]
  );

  // Group events into turns by MESSAGE_RECEIVED boundaries
  const turns = useMemo((): Turn[] => {
    const result: Turn[] = [];
    let current: Turn | null = null;

    for (const event of timelineEvents) {
      if (event.type === "MESSAGE_RECEIVED") {
        current = {
          id: event.id,
          receivedEvent: event,
          sentEvent: null,
          events: [],
          startTime: event.timestamp,
          endTime: event.timestamp,
          durationMs: 0,
          toolCount: 0,
          errorCount: 0,
          llmCount: 0,
          spawnCount: 0,
        };
        result.push(current);
      } else if (current) {
        if (event.type === "MESSAGE_SENT" || event.type === "MESSAGE_SEND") {
          current.sentEvent = event;
          current.endTime = event.timestamp;
          current.durationMs =
            new Date(event.timestamp).getTime() - new Date(current.startTime).getTime();
        } else {
          current.events.push(event);
          if (event.type === "TOOL_CALL" && !isLlmCall(event)) current.toolCount++;
          if (isLlmCall(event)) current.llmCount++;
          if (hasEventError(event)) current.errorCount++;
          if (event.type === "AGENT_SPAWN") current.spawnCount++;
        }
      }
    }

    return result;
  }, [timelineEvents]);

  // Auto-switch to timeline when there are no turns but there are events
  useEffect(() => {
    if (turns.length === 0 && timelineEvents.length > 0) {
      setViewMode("timeline");
    }
  }, [turns.length, timelineEvents.length]);

  // Flat filtered events (for timeline view)
  const filteredEvents = useMemo(() => {
    return timelineEvents.filter((event) => {
      if (filter === "tools" && event.type !== "TOOL_CALL") return false;
      if (filter === "llm" && !isLlmCall(event)) return false;
      if (filter === "errors" && !hasEventError(event)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (
          !event.toolName?.toLowerCase().includes(q) &&
          !event.type.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [timelineEvents, filter, searchQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-2">
          <div className="w-6 h-6 border-2 border-white/10 border-t-blue-400 rounded-full animate-spin" />
          <span className="text-xs text-white/30">Loading session…</span>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <span className="text-sm text-white/40">{error ?? "Session not found"}</span>
          <Link href="/sessions" className="text-xs text-blue-400/60 hover:text-blue-400 transition-colors">
            ← Back to sessions
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2 mb-2">
          <Link href="/sessions" className="text-white/25 hover:text-white/50 transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15,18 9,12 15,6" />
            </svg>
          </Link>
          <span className="text-white/15 text-xs">/</span>
          <span className="text-xs text-white/30">Sessions</span>
          <span className="text-white/15 text-xs">/</span>
          <span className="text-xs text-white/50 font-mono truncate">{session.key ?? session.id.slice(0, 14)}</span>
        </div>

        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-lg font-semibold text-white font-mono">
                {session.key ?? session.id.slice(0, 20) + "…"}
              </h1>
              {session.label && (
                <span className="text-[10px] text-blue-300/60 bg-blue-500/10 border border-blue-500/10 px-1.5 py-0.5 rounded">
                  {session.label}
                </span>
              )}
              <Link
                href={`/events?session=${encodeURIComponent(session.id)}`}
                className="flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg bg-white/[0.06] border border-white/[0.08] text-xs text-white/50 hover:text-white/80 hover:bg-white/[0.08] transition-colors min-h-[44px] sm:min-h-0"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="22,12 18,12 15,21 9,3 6,12 2,12" />
                </svg>
                View Events
              </Link>
            </div>
            <div className="flex items-center gap-3 mt-1 text-[11px] text-white/30">
              {session.model && <span className="text-white/40">{session.model.split("/").pop()}</span>}
              <span>•</span>
              <span>{timelineEvents.length} events</span>
              <span>•</span>
              <span>{turns.length} turns</span>
              <span>•</span>
              <span>{formatDuration(session.startedAt, session.lastSeenAt)}</span>
            </div>
          </div>
          <div className="text-right text-[10px] text-white/20 hidden sm:block">
            {session.startedAt && <div>Started {format(new Date(session.startedAt), "MMM d, HH:mm:ss")}</div>}
            <div>Last seen {format(new Date(session.lastSeenAt), "MMM d, HH:mm:ss")}</div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="shrink-0 px-4 sm:px-6 py-3 border-b border-white/[0.06]">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
          <StatPill label="Events" value={(summary?.eventCount ?? session.totalEvents).toLocaleString()} color="blue" />
          <StatPill label="Errors" value={String(summary?.errorCount ?? session.totalErrors)} color={(summary?.errorCount ?? session.totalErrors) > 0 ? "red" : "zinc"} />
          <StatPill label="In" value={formatTokens(summary?.totalInputTokens)} color="violet" />
          <StatPill label="Out" value={formatTokens(summary?.totalOutputTokens)} color="green" />
          <StatPill label="Duration" value={formatDuration(session.startedAt, session.lastSeenAt)} color="amber" />
          {summary?.totalCostUsd != null && summary.totalCostUsd > 0 ? (
            <div className="rounded-lg bg-amber-500/[0.06] border border-amber-500/20 px-3 py-2">
              <div className="text-[10px] text-amber-400/60 uppercase tracking-wider">Cost</div>
              <div className="text-lg font-bold text-amber-300">${summary.totalCostUsd.toFixed(4)}</div>
              <div className="text-[10px] text-white/25">${(summary.totalCostUsd / Math.max(1, summary.eventCount)).toFixed(6)}/event</div>
            </div>
          ) : (
            <StatPill label="Cost" value="$0.0000" color="zinc" />
          )}
        </div>
      </div>

      {/* View toggle + Filter bar */}
      <div className="shrink-0 px-4 sm:px-6 py-3 border-b border-white/[0.06] flex items-center gap-3 flex-wrap">
        {/* View mode toggle */}
        <div className="flex items-center bg-white/[0.04] rounded-lg p-0.5 border border-white/[0.06]">
          <button
            onClick={() => setViewMode("turns")}
            className={`text-[11px] px-3 py-1.5 rounded-md transition-colors ${
              viewMode === "turns" ? "bg-white/10 text-white" : "text-white/35 hover:text-white/55"
            }`}
          >
            💬 Turns{" "}
            <span className={turns.length === 0 ? "opacity-40" : ""}>({turns.length})</span>
          </button>
          <button
            onClick={() => setViewMode("timeline")}
            className={`text-[11px] px-3 py-1.5 rounded-md transition-colors ${
              viewMode === "timeline" ? "bg-white/10 text-white" : "text-white/35 hover:text-white/55"
            }`}
          >
            📋 Timeline
          </button>
        </div>

        {/* Filters (only in timeline view) */}
        {viewMode === "timeline" && (
          <>
            <div className="flex items-center gap-1">
              {(["all", "tools", "llm", "errors"] as FilterType[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`text-[11px] px-2.5 py-1.5 rounded-md transition-colors min-h-[36px] ${
                    filter === f ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60 hover:bg-white/[0.04]"
                  }`}
                >
                  {f === "all" ? "All" : f === "tools" ? "Tools" : f === "llm" ? "LLM" : "Errors"}
                </button>
              ))}
            </div>
            <div className="relative min-w-[120px] max-w-[200px]">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search tools…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-md pl-8 pr-3 py-1.5 text-xs text-white/70 placeholder-white/20 focus:outline-none min-h-[36px]"
              />
            </div>
          </>
        )}

        <span className="text-[10px] text-white/20 ml-auto">
          {viewMode === "turns" ? `${turns.length} turns` : `${filteredEvents.length} / ${timelineEvents.length}`}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* ── Turns view ── */}
        {viewMode === "turns" && (
          <div className="px-4 sm:px-6 py-4 space-y-3">
            {turns.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-60 gap-4 text-center py-8">
                {(() => {
                  const isCron = id.startsWith("agent:main:cron:");
                  const isSubagent = id.startsWith("agent:main:subagent:");
                  const icon = isCron ? "⏰" : "🤖";
                  const label = isCron ? "Cron Job" : isSubagent ? "Sub-agent Session" : "Agent Session";
                  return (
                    <>
                      <div className="text-4xl leading-none">{icon}</div>
                      <div>
                        <p className="text-sm text-white/40">This session has no message turns.</p>
                        <p className="text-xs text-white/25 mt-1">
                          {timelineEvents.length === 0
                            ? "No events have been recorded yet."
                            : `It's a ${label} — it doesn't receive user messages.`}
                        </p>
                      </div>
                      {timelineEvents.length > 0 && (
                        <button
                          onClick={() => setViewMode("timeline")}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-500/15 border border-blue-500/20 text-blue-300 text-sm hover:bg-blue-500/25 transition-colors min-h-[44px]"
                        >
                          📋 View Timeline
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>
            ) : (
              turns.map((turn, i) => (
                <TurnCard key={turn.id} turn={turn} turnIndex={i} maxDuration={maxDuration} />
              ))
            )}
          </div>
        )}

        {/* ── Timeline view ── */}
        {viewMode === "timeline" && (
          <div className="px-3 sm:px-6 py-3">
            {filteredEvents.length === 0 ? (
              <div className="flex items-center justify-center h-40">
                <span className="text-xs text-white/20">
                  {timelineEvents.length === 0 ? "No events" : "No events match filter"}
                </span>
              </div>
            ) : (
              <div className="relative">
                <div className="absolute left-[7px] top-3 bottom-3 w-px bg-white/[0.04]" />
                <div className="space-y-0.5">
                  {filteredEvents.map((event) => (
                    <EventRow
                      key={event.id}
                      event={event}
                      isExpanded={expandedEvent === event.id}
                      onToggle={() => setExpandedEvent(expandedEvent === event.id ? null : event.id)}
                      maxDuration={maxDuration}
                    />
                  ))}
                </div>
              </div>
            )}
            {/* Load older events button (timeline view) */}
            {hasMore && (
              <div className="pt-4 pb-4 flex justify-center">
                <button
                  onClick={loadMoreEvents}
                  disabled={loadingMore}
                  className="flex items-center gap-2 px-5 py-3 min-h-[44px] rounded-xl bg-white/[0.05] border border-white/[0.09] text-sm text-white/50 hover:text-white/80 hover:bg-white/[0.08] hover:border-white/[0.14] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingMore ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/15 border-t-white/50 rounded-full animate-spin" />
                      <span>Loading…</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="17,1 21,5 17,9" />
                        <path d="M3,11V9a4,4,0,0,1,4-4h14" />
                        <polyline points="7,23 3,19 7,15" />
                        <path d="M21,13v2a4,4,0,0,1-4,4H3" />
                      </svg>
                      <span>Load older events</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
