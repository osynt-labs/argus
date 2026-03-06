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

const TYPE_COLORS: Record<string, string> = {
  TOOL_CALL: "bg-blue-500/20 text-blue-300 border-blue-500/20",
  MESSAGE_SEND: "bg-violet-500/20 text-violet-300 border-violet-500/20",
  AGENT_SPAWN: "bg-cyan-500/20 text-cyan-300 border-cyan-500/20",
  CRON_RUN: "bg-amber-500/20 text-amber-300 border-amber-500/20",
  ERROR: "bg-red-500/20 text-red-300 border-red-500/20",
  SESSION_START: "bg-emerald-500/20 text-emerald-300 border-emerald-500/20",
  SESSION_END: "bg-zinc-500/20 text-zinc-300 border-zinc-500/20",
  MODEL_SWITCH: "bg-pink-500/20 text-pink-300 border-pink-500/20",
};

const TYPE_LABELS: Record<string, string> = {
  TOOL_CALL: "Tool Call",
  MESSAGE_SEND: "Message",
  AGENT_SPAWN: "Agent Spawn",
  CRON_RUN: "Cron Run",
  ERROR: "Error",
  SESSION_START: "Session Start",
  SESSION_END: "Session End",
  MODEL_SWITCH: "Model Switch",
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
              {session.agentId && (
                <span className="flex items-center gap-1">
                  <svg
                    className="w-3 h-3 text-white/20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  {session.agentId}
                </span>
              )}
              {session.model && (
                <span className="text-white/20">
                  {session.model.split("/").pop()}
                </span>
              )}
              <span className="text-white/15">
                {formatDistanceToNow(new Date(session.lastSeenAt), {
                  addSuffix: true,
                })}
              </span>
            </div>
          </div>

          <div className="text-right text-[10px] text-white/20">
            {session.startedAt && (
              <div>Started {format(new Date(session.startedAt), "MMM d, HH:mm:ss")}</div>
            )}
            <div>Last seen {format(new Date(session.lastSeenAt), "MMM d, HH:mm:ss")}</div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="shrink-0 px-4 sm:px-6 py-3 border-b border-white/[0.06]">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
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
            label="Input Tokens"
            value={formatTokens(summary?.totalInputTokens)}
            color="violet"
          />
          <StatPill
            label="Output Tokens"
            value={formatTokens(summary?.totalOutputTokens)}
            color="green"
          />
          <StatPill
            label="Duration"
            value={formatDuration(session.startedAt, session.lastSeenAt)}
            color="amber"
          />
        </div>
      </div>

      {/* Event Timeline */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 sm:px-6 py-3 border-b border-white/[0.06] flex items-center justify-between sticky top-0 bg-[#0a0a0f] z-10">
          <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
            Event Timeline
          </h2>
          <span className="text-[10px] text-white/15 tabular-nums">
            {timelineEvents.length} events
          </span>
        </div>

        {timelineEvents.length === 0 ? (
          <div className="flex items-center justify-center h-40">
            <span className="text-xs text-white/20">No events in this session</span>
          </div>
        ) : (
          <div className="px-4 sm:px-6 py-3">
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-[15px] top-0 bottom-0 w-px bg-white/[0.06]" />

              <div className="space-y-1">
                {timelineEvents.map((event) => {
                  const isExpanded = expandedEvent === event.id;
                  const hasError =
                    event.status === "error" || event.type === "ERROR" || !!event.error;
                  const typeColor =
                    TYPE_COLORS[event.type] ??
                    "bg-white/10 text-white/50 border-white/10";
                  const totalEventTokens =
                    (event.inputTokens ?? 0) +
                    (event.outputTokens ?? 0) +
                    (event.cacheTokens ?? 0);

                  return (
                    <div key={event.id} className="relative pl-9">
                      {/* Timeline dot */}
                      <div
                        className={`absolute left-[11px] top-3 w-[9px] h-[9px] rounded-full border-2 ${
                          hasError
                            ? "bg-red-500/60 border-red-500/40"
                            : "bg-white/10 border-white/[0.08]"
                        }`}
                      />

                      <button
                        onClick={() =>
                          setExpandedEvent(isExpanded ? null : event.id)
                        }
                        className={`w-full text-left rounded-lg border transition-colors p-3 ${
                          isExpanded
                            ? "bg-white/[0.04] border-white/[0.08]"
                            : "bg-white/[0.01] border-transparent hover:bg-white/[0.03] hover:border-white/[0.05]"
                        }`}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Type badge */}
                          <span
                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${typeColor}`}
                          >
                            {TYPE_LABELS[event.type] ?? event.type}
                          </span>

                          {/* Tool name */}
                          {event.toolName && (
                            <span className="text-xs font-mono text-white/60">
                              {event.toolName}
                            </span>
                          )}

                          {/* Error indicator */}
                          {hasError && (
                            <span className="text-[10px] text-red-400 font-medium">
                              error
                            </span>
                          )}

                          <div className="flex-1" />

                          {/* Duration */}
                          {event.durationMs != null && (
                            <span className="text-[10px] font-mono text-white/20 tabular-nums">
                              {formatMs(event.durationMs)}
                            </span>
                          )}

                          {/* Tokens */}
                          {totalEventTokens > 0 && (
                            <span className="text-[10px] font-mono text-white/15 tabular-nums">
                              {formatTokens(totalEventTokens)} tok
                            </span>
                          )}

                          {/* Timestamp */}
                          <span className="text-[10px] font-mono text-white/15 tabular-nums">
                            {format(new Date(event.timestamp), "HH:mm:ss.SSS")}
                          </span>

                          {/* Expand indicator */}
                          <svg
                            className={`w-3 h-3 text-white/15 transition-transform ${
                              isExpanded ? "rotate-90" : ""
                            }`}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <polyline points="9,18 15,12 9,6" />
                          </svg>
                        </div>

                        {/* Error message (always show if present) */}
                        {event.error && (
                          <div className="mt-1.5 text-[11px] text-red-300/60 truncate">
                            {event.error}
                          </div>
                        )}
                      </button>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="mt-1 ml-0 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 space-y-3">
                          {/* Detail grid */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                            <div>
                              <span className="text-white/25 block">Event ID</span>
                              <span className="font-mono text-white/50 break-all">
                                {event.id.slice(0, 20)}
                              </span>
                            </div>
                            <div>
                              <span className="text-white/25 block">Model</span>
                              <span className="text-white/50">
                                {event.model?.split("/").pop() ?? "--"}
                              </span>
                            </div>
                            <div>
                              <span className="text-white/25 block">
                                Input Tokens
                              </span>
                              <span className="font-mono text-white/50">
                                {event.inputTokens?.toLocaleString() ?? "--"}
                              </span>
                            </div>
                            <div>
                              <span className="text-white/25 block">
                                Output Tokens
                              </span>
                              <span className="font-mono text-white/50">
                                {event.outputTokens?.toLocaleString() ?? "--"}
                              </span>
                            </div>
                            {event.cacheTokens != null && event.cacheTokens > 0 && (
                              <div>
                                <span className="text-white/25 block">
                                  Cache Tokens
                                </span>
                                <span className="font-mono text-white/50">
                                  {event.cacheTokens.toLocaleString()}
                                </span>
                              </div>
                            )}
                            <div>
                              <span className="text-white/25 block">Status</span>
                              <span
                                className={`${
                                  event.status === "error"
                                    ? "text-red-400"
                                    : "text-white/50"
                                }`}
                              >
                                {event.status ?? "--"}
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
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatPill({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
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
    <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] px-3 py-2">
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
