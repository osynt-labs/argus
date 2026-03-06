"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  formatDistanceToNow,
  format,
  intervalToDuration,
} from "date-fns";

interface SessionEvent {
  id: string;
  type: string;
  toolName?: string | null;
  sessionId: string;
  timestamp: string;
  durationMs?: number | null;
  status?: string | null;
  error?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cacheTokens?: number | null;
  model?: string | null;
  input?: unknown;
  output?: unknown;
  metadata?: unknown;
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
  totalTokens: number;
}

type FilterType = "all" | "tools" | "llm" | "errors";

// Event type icons
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
  CRON_RUN: "⏰",
  ERROR: "❌",
  MODEL_SWITCH: "🔄",
};

const TYPE_COLORS: Record<string, string> = {
  TOOL_CALL: "bg-blue-500/20 text-blue-300 border-blue-500/20",
  MESSAGE_SEND: "bg-violet-500/20 text-violet-300 border-violet-500/20",
  MESSAGE_SENT: "bg-violet-500/20 text-violet-300 border-violet-500/20",
  MESSAGE_RECEIVED: "bg-emerald-500/20 text-emerald-300 border-emerald-500/20",
  AGENT_SPAWN: "bg-cyan-500/20 text-cyan-300 border-cyan-500/20",
  AGENT_START: "bg-cyan-500/20 text-cyan-300 border-cyan-500/20",
  AGENT_END: "bg-cyan-500/20 text-cyan-300 border-cyan-500/20",
  CRON_RUN: "bg-amber-500/20 text-amber-300 border-amber-500/20",
  ERROR: "bg-red-500/20 text-red-300 border-red-500/20",
  SESSION_START: "bg-emerald-500/20 text-emerald-300 border-emerald-500/20",
  SESSION_END: "bg-zinc-500/20 text-zinc-300 border-zinc-500/20",
  MODEL_SWITCH: "bg-pink-500/20 text-pink-300 border-pink-500/20",
};

const TYPE_LABELS: Record<string, string> = {
  TOOL_CALL: "Tool",
  MESSAGE_SEND: "Message",
  MESSAGE_SENT: "Sent",
  MESSAGE_RECEIVED: "Received",
  AGENT_SPAWN: "Spawn",
  AGENT_START: "Agent Start",
  AGENT_END: "Agent End",
  CRON_RUN: "Cron",
  ERROR: "Error",
  SESSION_START: "Start",
  SESSION_END: "End",
  MODEL_SWITCH: "Switch",
};

function formatDuration(startedAt?: string, lastSeenAt?: string): string {
  if (!startedAt || !lastSeenAt) return "--";
  const dur = intervalToDuration({
    start: new Date(startedAt),
    end: new Date(lastSeenAt),
  });
  const parts: string[] = [];
  if (dur.days) parts.push(`${dur.days}d`);
  if (dur.hours) parts.push(`${dur.hours}h`);
  if (dur.minutes) parts.push(`${dur.minutes}m`);
  if (dur.seconds) parts.push(`${dur.seconds}s`);
  if (!parts.length) parts.push("0s");
  return parts.join(" ");
}

function formatTokens(n?: number | null): string {
  if (n == null || n === 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatMs(ms?: number | null): string {
  if (ms == null) return "--";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// Check if event is an LLM call
function isLlmCall(event: SessionEvent): boolean {
  return event.toolName === "llm_call" || event.toolName === "llm" || 
    (event.type === "TOOL_CALL" && (event.inputTokens ?? 0) > 0 && (event.outputTokens ?? 0) > 0);
}

// Get message preview from metadata
function getMessagePreview(event: SessionEvent): string | null {
  if (event.type !== "MESSAGE_RECEIVED" && event.type !== "MESSAGE_SENT") return null;
  const meta = event.metadata as Record<string, unknown> | null;
  if (!meta) return null;
  const preview = meta.content_preview ?? meta.prompt_preview ?? meta.content ?? meta.text;
  if (typeof preview === "string" && preview.length > 0) {
    return preview.length > 100 ? preview.slice(0, 100) + "…" : preview;
  }
  return null;
}

// Check if event has error
function hasEventError(event: SessionEvent): boolean {
  return event.status === "error" || event.type === "ERROR" || !!event.error;
}

export default function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/sessions/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "Session not found" : "Failed to load");
        return r.json();
      })
      .then((data) => {
        setSession(data.session);
        setSummary(data.summary);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  // Sort events chronologically (oldest first for timeline)
  const timelineEvents = useMemo(() => {
    if (!session?.events) return [];
    return [...session.events].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  }, [session]);

  // Calculate max duration for waterfall bars
  const maxDuration = useMemo(() => {
    return Math.max(...timelineEvents.map(e => e.durationMs ?? 0), 1);
  }, [timelineEvents]);

  // Group events by agent turns (events between AGENT_START and AGENT_END)
  const groupedEvents = useMemo(() => {
    const groups: { event: SessionEvent; isInAgentTurn: boolean; isLastInGroup: boolean }[] = [];
    let inAgentTurn = false;
    
    timelineEvents.forEach((event, idx) => {
      if (event.type === "AGENT_START") {
        inAgentTurn = true;
        groups.push({ event, isInAgentTurn: false, isLastInGroup: false });
      } else if (event.type === "AGENT_END") {
        inAgentTurn = false;
        groups.push({ event, isInAgentTurn: false, isLastInGroup: false });
      } else {
        // Check if next event is AGENT_END
        const nextEvent = timelineEvents[idx + 1];
        const isLastInGroup = inAgentTurn && nextEvent?.type === "AGENT_END";
        groups.push({ event, isInAgentTurn: inAgentTurn, isLastInGroup });
      }
    });
    
    return groups;
  }, [timelineEvents]);

  // Filter events
  const filteredEvents = useMemo(() => {
    return groupedEvents.filter(({ event }) => {
      // Apply type filter
      if (filter === "tools" && event.type !== "TOOL_CALL") return false;
      if (filter === "llm" && !isLlmCall(event)) return false;
      if (filter === "errors" && !hasEventError(event)) return false;
      
      // Apply search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const toolName = event.toolName?.toLowerCase() ?? "";
        const type = event.type.toLowerCase();
        if (!toolName.includes(q) && !type.includes(q)) return false;
      }
      
      return true;
    });
  }, [groupedEvents, filter, searchQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-2">
          <div className="w-6 h-6 border-2 border-white/10 border-t-blue-400 rounded-full animate-spin" />
          <span className="text-xs text-white/30">Loading session...</span>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <svg
            className="w-10 h-10 text-white/10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <span className="text-sm text-white/40">{error ?? "Session not found"}</span>
          <Link
            href="/sessions"
            className="text-xs text-blue-400/60 hover:text-blue-400 transition-colors"
          >
            Back to sessions
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
          <Link
            href="/sessions"
            className="text-white/25 hover:text-white/50 transition-colors"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="15,18 9,12 15,6" />
            </svg>
          </Link>
          <span className="text-white/15 text-xs">/</span>
          <span className="text-xs text-white/30">Sessions</span>
          <span className="text-white/15 text-xs">/</span>
          <span className="text-xs text-white/50 font-mono truncate">
            {session.key ?? session.id.slice(0, 14)}
          </span>
        </div>

        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-semibold text-white font-mono">
                {session.key ?? session.id.slice(0, 20) + "\u2026"}
              </h1>
              {session.label && (
                <span className="text-[10px] text-blue-300/60 bg-blue-500/10 border border-blue-500/10 px-1.5 py-0.5 rounded">
                  {session.label}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-[11px] text-white/30">
              {session.model && (
                <span className="text-white/40">
                  {session.model.split("/").pop()}
                </span>
              )}
              <span>•</span>
              <span>{timelineEvents.length} events</span>
              <span>•</span>
              <span>{formatDuration(session.startedAt, session.lastSeenAt)}</span>
            </div>
          </div>

          <div className="text-right text-[10px] text-white/20 hidden sm:block">
            {session.startedAt && (
              <div>Started {format(new Date(session.startedAt), "MMM d, HH:mm:ss")}</div>
            )}
            <div>Last seen {format(new Date(session.lastSeenAt), "MMM d, HH:mm:ss")}</div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="shrink-0 px-4 sm:px-6 py-3 border-b border-white/[0.06]">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
          <StatPill
            label="Events"
            value={summary?.eventCount?.toLocaleString() ?? String(session.totalEvents)}
            color="blue"
          />
          <StatPill
            label="Errors"
            value={String(summary?.errorCount ?? session.totalErrors)}
            color={
              (summary?.errorCount ?? session.totalErrors) > 0 ? "red" : "zinc"
            }
          />
          <StatPill
            label="In"
            value={formatTokens(summary?.totalInputTokens)}
            color="violet"
          />
          <StatPill
            label="Out"
            value={formatTokens(summary?.totalOutputTokens)}
            color="green"
          />
          <StatPill
            label="Duration"
            value={formatDuration(session.startedAt, session.lastSeenAt)}
            color="amber"
            className="col-span-2 sm:col-span-1"
          />
        </div>
      </div>

      {/* Filter Bar */}
      <div className="shrink-0 px-4 sm:px-6 py-3 border-b border-white/[0.06] flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          {(["all", "tools", "llm", "errors"] as FilterType[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-[11px] px-2.5 py-1.5 rounded-md transition-colors min-h-[36px] ${
                filter === f
                  ? "bg-white/10 text-white"
                  : "text-white/40 hover:text-white/60 hover:bg-white/[0.04]"
              }`}
            >
              {f === "all" ? "All" : f === "tools" ? "Tools" : f === "llm" ? "LLM" : "Errors"}
            </button>
          ))}
        </div>
        
        <div className="flex-1 min-w-[120px] max-w-[200px]">
          <div className="relative">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search tools..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/[0.03] border border-white/[0.06] rounded-md pl-8 pr-3 py-1.5 text-xs text-white/70 placeholder-white/20 focus:outline-none focus:border-white/10 min-h-[36px]"
            />
          </div>
        </div>
        
        <span className="text-[10px] text-white/20 ml-auto">
          {filteredEvents.length} / {timelineEvents.length}
        </span>
      </div>

      {/* Event Timeline */}
      <div className="flex-1 overflow-y-auto">
        {filteredEvents.length === 0 ? (
          <div className="flex items-center justify-center h-40">
            <span className="text-xs text-white/20">
              {timelineEvents.length === 0 ? "No events in this session" : "No events match filter"}
            </span>
          </div>
        ) : (
          <div className="px-3 sm:px-6 py-3">
            <div className="relative">
              {/* Main timeline line */}
              <div className="absolute left-[7px] top-3 bottom-3 w-px bg-white/[0.04]" />

              <div className="space-y-0.5">
                {filteredEvents.map(({ event, isInAgentTurn, isLastInGroup }) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    isInAgentTurn={isInAgentTurn}
                    isLastInGroup={isLastInGroup}
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
    </div>
  );
}

function EventRow({
  event,
  isInAgentTurn,
  isLastInGroup,
  isExpanded,
  onToggle,
  maxDuration,
}: {
  event: SessionEvent;
  isInAgentTurn: boolean;
  isLastInGroup: boolean;
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

  // Determine dot color
  const dotColor = hasError
    ? "bg-red-500 border-red-500/50"
    : event.type === "SESSION_START"
    ? "bg-emerald-500 border-emerald-500/50"
    : event.type === "SESSION_END"
    ? "bg-zinc-500 border-zinc-500/50"
    : event.type === "AGENT_START" || event.type === "AGENT_END"
    ? "bg-cyan-500 border-cyan-500/50"
    : isLlm
    ? "bg-violet-500 border-violet-500/50"
    : "bg-white/20 border-white/10";

  return (
    <div className={`relative ${isInAgentTurn ? "ml-4 sm:ml-6" : ""}`}>
      {/* Agent turn grouping border */}
      {isInAgentTurn && (
        <div 
          className={`absolute left-0 top-0 w-px bg-white/[0.06] ${isLastInGroup ? "bottom-1/2" : "bottom-0"}`} 
          style={{ left: "-12px" }}
        />
      )}
      
      {/* Timeline dot */}
      <div
        className={`absolute left-[3px] top-4 w-[9px] h-[9px] rounded-full border-2 z-10 ${dotColor}`}
      />

      {/* Event content */}
      <button
        onClick={onToggle}
        className={`w-full text-left pl-6 pr-2 py-2 min-h-[44px] rounded-lg transition-colors ${
          hasError
            ? "border-l-2 border-red-500/30 bg-red-500/[0.02] ml-[2px] pl-[22px]"
            : isExpanded
            ? "bg-white/[0.04]"
            : "hover:bg-white/[0.02]"
        }`}
      >
        {/* Main row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Timestamp - time only on mobile */}
          <span className="text-[10px] font-mono text-white/25 tabular-nums w-[52px] shrink-0">
            {format(new Date(event.timestamp), "HH:mm:ss")}
          </span>

          {/* Icon */}
          <span className="text-sm">{icon}</span>

          {/* Type badge or LLM card header */}
          {isLlm ? (
            <span className="text-[10px] font-medium text-violet-300">LLM Call</span>
          ) : (
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${typeColor}`}>
              {TYPE_LABELS[event.type] ?? event.type}
            </span>
          )}

          {/* Tool name */}
          {event.toolName && !isLlm && (
            <span className="text-[11px] font-mono text-white/50 truncate max-w-[120px]">
              {event.toolName}
            </span>
          )}

          {/* Model for agent/llm events */}
          {(event.type === "AGENT_START" || isLlm) && event.model && (
            <span className="text-[10px] text-white/25">
              {event.model.split("/").pop()}
            </span>
          )}

          <div className="flex-1 min-w-0" />

          {/* Duration bar - hidden on mobile */}
          {event.durationMs != null && event.durationMs > 0 && (
            <div className="hidden sm:flex items-center gap-2 w-[100px]">
              <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className={`h-full rounded-full ${isLlm ? "bg-violet-400/50" : "bg-blue-400/50"}`}
                  style={{ width: barWidth }}
                />
              </div>
              <span className="text-[10px] font-mono text-white/30 tabular-nums w-[40px] text-right">
                {formatMs(event.durationMs)}
              </span>
            </div>
          )}

          {/* Duration text on mobile */}
          {event.durationMs != null && event.durationMs > 0 && (
            <span className="sm:hidden text-[10px] font-mono text-white/30">
              {formatMs(event.durationMs)}
            </span>
          )}

          {/* Expand indicator */}
          <svg
            className={`w-3 h-3 text-white/15 transition-transform shrink-0 ${isExpanded ? "rotate-90" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="9,18 15,12 9,6" />
          </svg>
        </div>

        {/* LLM Call inline card */}
        {isLlm && (
          <div className="mt-1.5 ml-[60px] sm:ml-[60px]">
            <div className="bg-violet-500/5 border border-violet-500/10 rounded-lg p-2">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-white/40">
                <span>↓ {formatTokens(event.inputTokens)} in</span>
                <span>↑ {formatTokens(event.outputTokens)} out</span>
                {event.cacheTokens != null && event.cacheTokens > 0 && (
                  <span className="text-amber-300/50">💾 {formatTokens(event.cacheTokens)} cache</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Message preview */}
        {messagePreview && (
          <div className="mt-1 ml-[60px] text-[11px] text-white/30 italic line-clamp-2">
            "{messagePreview}"
          </div>
        )}

        {/* Error message inline */}
        {event.error && !isExpanded && (
          <div className="mt-1 ml-[60px] text-[11px] text-red-300/60 truncate">
            {event.error}
          </div>
        )}
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="mt-1 ml-6 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 space-y-3">
          {/* Detail grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            <div>
              <span className="text-white/25 block">Event ID</span>
              <span className="font-mono text-white/50 break-all text-[10px]">
                {event.id.slice(0, 16)}…
              </span>
            </div>
            <div>
              <span className="text-white/25 block">Model</span>
              <span className="text-white/50">
                {event.model?.split("/").pop() ?? "--"}
              </span>
            </div>
            {event.inputTokens != null && (
              <div>
                <span className="text-white/25 block">Input Tokens</span>
                <span className="font-mono text-white/50">
                  {event.inputTokens.toLocaleString()}
                </span>
              </div>
            )}
            {event.outputTokens != null && (
              <div>
                <span className="text-white/25 block">Output Tokens</span>
                <span className="font-mono text-white/50">
                  {event.outputTokens.toLocaleString()}
                </span>
              </div>
            )}
            {event.cacheTokens != null && event.cacheTokens > 0 && (
              <div>
                <span className="text-white/25 block">Cache Tokens</span>
                <span className="font-mono text-white/50">
                  {event.cacheTokens.toLocaleString()}
                </span>
              </div>
            )}
            <div>
              <span className="text-white/25 block">Status</span>
              <span
                className={`${
                  event.status === "error" ? "text-red-400" : "text-white/50"
                }`}
              >
                {event.status ?? "--"}
              </span>
            </div>
            <div>
              <span className="text-white/25 block">Duration</span>
              <span className="font-mono text-white/50">
                {formatMs(event.durationMs)}
              </span>
            </div>
            <div>
              <span className="text-white/25 block">Timestamp</span>
              <span className="font-mono text-white/50 text-[10px]">
                {format(new Date(event.timestamp), "HH:mm:ss.SSS")}
              </span>
            </div>
          </div>

          {/* Input */}
          {event.input != null && (
            <div>
              <span className="text-[10px] text-white/25 uppercase tracking-wider font-semibold block mb-1">
                Input
              </span>
              <pre className="text-[11px] text-white/40 bg-black/30 rounded-lg p-3 overflow-x-auto max-h-60 leading-relaxed">
                {typeof event.input === "string"
                  ? event.input
                  : JSON.stringify(event.input, null, 2)}
              </pre>
            </div>
          )}

          {/* Output */}
          {event.output != null && (
            <div>
              <span className="text-[10px] text-white/25 uppercase tracking-wider font-semibold block mb-1">
                Output
              </span>
              <pre className="text-[11px] text-white/40 bg-black/30 rounded-lg p-3 overflow-x-auto max-h-60 leading-relaxed">
                {typeof event.output === "string"
                  ? event.output
                  : JSON.stringify(event.output, null, 2)}
              </pre>
            </div>
          )}

          {/* Error detail */}
          {event.error && (
            <div>
              <span className="text-[10px] text-red-400/40 uppercase tracking-wider font-semibold block mb-1">
                Error
              </span>
              <pre className="text-[11px] text-red-300/50 bg-red-500/[0.04] border border-red-500/10 rounded-lg p-3 overflow-x-auto max-h-40 leading-relaxed">
                {event.error}
              </pre>
            </div>
          )}

          {/* Metadata */}
          {event.metadata != null && (
            <div>
              <span className="text-[10px] text-white/25 uppercase tracking-wider font-semibold block mb-1">
                Metadata
              </span>
              <pre className="text-[11px] text-white/30 bg-black/30 rounded-lg p-3 overflow-x-auto max-h-40 leading-relaxed">
                {typeof event.metadata === "string"
                  ? event.metadata
                  : JSON.stringify(event.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatPill({
  label,
  value,
  color,
  className = "",
}: {
  label: string;
  value: string;
  color: string;
  className?: string;
}) {
  const colorMap: Record<string, string> = {
    blue: "text-blue-300",
    red: "text-red-400",
    violet: "text-violet-300",
    green: "text-emerald-300",
    amber: "text-amber-300",
    zinc: "text-white/30",
  };

  return (
    <div className={`rounded-lg bg-white/[0.03] border border-white/[0.05] px-3 py-2 ${className}`}>
      <div className="text-[10px] text-white/25 uppercase tracking-wider">
        {label}
      </div>
      <div
        className={`text-base font-semibold font-mono tabular-nums mt-0.5 ${
          colorMap[color] ?? "text-white/50"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
