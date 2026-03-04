"use client";

import { useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";

interface Event {
  id: string;
  type: string;
  toolName?: string;
  sessionId: string;
  timestamp: string;
  durationMs?: number;
  status?: string;
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
}

const TOOL_ICONS: Record<string, string> = {
  exec: "⚡",
  browser: "🌐",
  edit: "✏️",
  read: "📖",
  write: "📝",
  web_search: "🔍",
  web_fetch: "🔗",
  memory_search: "🧠",
  memory_get: "💭",
  image: "🖼️",
  tts: "🔊",
  message: "💬",
  cron: "⏰",
  sessions_spawn: "🤖",
  sessions_send: "📡",
  canvas: "🎨",
};

const TYPE_COLORS: Record<string, string> = {
  TOOL_CALL: "bg-blue-500/10 border-blue-500/20 text-blue-400",
  MESSAGE_SEND: "bg-green-500/10 border-green-500/20 text-green-400",
  AGENT_SPAWN: "bg-purple-500/10 border-purple-500/20 text-purple-400",
  CRON_RUN: "bg-yellow-500/10 border-yellow-500/20 text-yellow-400",
  ERROR: "bg-red-500/10 border-red-500/20 text-red-400",
  SESSION_START: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
  SESSION_END: "bg-gray-500/10 border-gray-500/20 text-gray-400",
};

export function LiveFeed({ initialEvents = [] }: { initialEvents?: Event[] }) {
  const [events, setEvents] = useState<Event[]>(initialEvents);
  const [connected, setConnected] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    const es = new EventSource("/api/live");
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (e) => {
      const event = JSON.parse(e.data);
      setEvents((prev) => [event, ...prev].slice(0, 500));
    };
    return () => es.close();
  }, []);

  useEffect(() => {
    if (autoScroll && feedRef.current) {
      feedRef.current.scrollTop = 0;
    }
  }, [events, autoScroll]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${connected ? "bg-green-400 animate-pulse" : "bg-red-400"}`}
          />
          <span className="text-sm font-medium text-white/70">
            {connected ? "Live" : "Disconnected"}
          </span>
          <span className="text-xs text-white/30 ml-2">{events.length} events</span>
        </div>
        <button
          onClick={() => setAutoScroll((v) => !v)}
          className={`text-xs px-2 py-1 rounded border ${autoScroll ? "border-blue-500/50 text-blue-400" : "border-white/10 text-white/30"}`}
        >
          {autoScroll ? "↑ Auto-scroll" : "Paused"}
        </button>
      </div>

      {/* Feed */}
      <div ref={feedRef} className="flex-1 overflow-y-auto font-mono text-xs">
        {events.length === 0 && (
          <div className="flex items-center justify-center h-32 text-white/20">
            Waiting for events...
          </div>
        )}
        {events.map((ev) => (
          <div
            key={ev.id}
            className={`flex items-start gap-3 px-4 py-2.5 border-b border-white/3 hover:bg-white/3 transition-colors ${
              ev.status === "error" || ev.error ? "border-l-2 border-l-red-500" : ""
            }`}
          >
            {/* Icon */}
            <span className="text-base shrink-0 mt-0.5">
              {TOOL_ICONS[ev.toolName ?? ""] ??
                (ev.type === "AGENT_SPAWN"
                  ? "🤖"
                  : ev.type === "CRON_RUN"
                    ? "⏰"
                    : "📌")}
            </span>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${TYPE_COLORS[ev.type] ?? "bg-white/5 text-white/40 border-white/10"}`}
                >
                  {ev.type.replace("_", " ")}
                </span>
                {ev.toolName && (
                  <span className="text-white/70 font-semibold">{ev.toolName}</span>
                )}
                {ev.model && (
                  <span className="text-white/20 text-[10px]">
                    {ev.model.split("/").pop()}
                  </span>
                )}
                {ev.durationMs && (
                  <span className="text-white/30">{ev.durationMs}ms</span>
                )}
                {(ev.inputTokens || ev.outputTokens) && (
                  <span className="text-white/20">
                    {ev.inputTokens ?? 0}↑ {ev.outputTokens ?? 0}↓
                  </span>
                )}
              </div>
              {ev.error && (
                <div className="mt-1 text-red-400/80 truncate">{ev.error}</div>
              )}
              <div className="mt-0.5 text-white/20 text-[10px]">
                {ev.sessionId.slice(0, 8)}... ·{" "}
                {formatDistanceToNow(new Date(ev.timestamp), { addSuffix: true })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
