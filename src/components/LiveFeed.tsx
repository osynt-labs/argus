"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";

interface Event {
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
  model?: string | null;
}

const TOOL_ICONS: Record<string, string> = {
  exec: "⚡", browser: "🌐", edit: "✏️", read: "📖", write: "📝",
  web_search: "🔍", web_fetch: "🔗", memory_search: "🧠", memory_get: "💭",
  image: "🖼️", tts: "🔊", message: "💬", cron: "⏰",
  sessions_spawn: "🤖", sessions_send: "📡", canvas: "🎨", process: "🔄",
};

const TYPE_BADGE: Record<string, string> = {
  TOOL_CALL:     "bg-blue-500/15   text-blue-300   border-blue-500/20",
  MESSAGE_SEND:  "bg-green-500/15  text-green-300  border-green-500/20",
  AGENT_SPAWN:   "bg-purple-500/15 text-purple-300 border-purple-500/20",
  CRON_RUN:      "bg-yellow-500/15 text-yellow-300 border-yellow-500/20",
  ERROR:         "bg-red-500/15    text-red-300    border-red-500/20",
  SESSION_START: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  SESSION_END:   "bg-gray-500/15   text-gray-400   border-gray-500/20",
};

export function LiveFeed({
  initialEvents = [],
  onConnectionChange,
}: {
  initialEvents?: Event[];
  onConnectionChange?: (connected: boolean) => void;
}) {
  const [events, setEvents] = useState<Event[]>(initialEvents);
  const [connected, setConnected] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [newCount, setNewCount] = useState(0);
  const topRef = useRef<HTMLDivElement>(null);

  const setConn = useCallback((v: boolean) => {
    setConnected(v);
    onConnectionChange?.(v);
  }, [onConnectionChange]);

  useEffect(() => {
    const es = new EventSource("/api/live");
    es.onopen = () => setConn(true);
    es.onerror = () => setConn(false);
    es.onmessage = (e) => {
      const event: Event = JSON.parse(e.data);
      setEvents((prev) => [event, ...prev].slice(0, 500));
      setNewCount((n) => n + 1);
    };
    return () => es.close();
  }, [setConn]);

  const filtered = filter === "all" ? events : events.filter((e) =>
    filter === "errors" ? e.status === "error" || !!e.error :
    filter === "tools"  ? e.type === "TOOL_CALL" :
    filter === "agents" ? e.type === "AGENT_SPAWN" : true
  );

  const filters = [
    { id: "all",    label: "All" },
    { id: "tools",  label: "⚡ Tools" },
    { id: "agents", label: "🤖 Agents" },
    { id: "errors", label: "🔴 Errors" },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Filter tabs */}
      <div className="flex items-center gap-1.5 px-3 py-2.5 border-b border-white/5 overflow-x-auto scrollbar-none">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => { setFilter(f.id); setNewCount(0); }}
            className={`shrink-0 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              filter === f.id
                ? "bg-white/10 text-white"
                : "text-white/30 hover:text-white/60"
            }`}
          >
            {f.label}
            {f.id === "all" && newCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-blue-500 text-white text-[9px] font-bold">
                {newCount > 99 ? "99+" : newCount}
              </span>
            )}
          </button>
        ))}
        <div className="ml-auto shrink-0 text-[10px] text-white/20">{events.length} events</div>
      </div>

      {/* Events */}
      <div ref={topRef} className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <span className="text-3xl opacity-20">👁</span>
            <p className="text-xs text-white/20">Waiting for events…</p>
          </div>
        )}

        {filtered.map((ev) => (
          <div
            key={ev.id}
            className={`flex items-start gap-3 px-3 py-2.5 border-b border-white/[0.03] active:bg-white/3 transition-colors ${
              ev.status === "error" || ev.error
                ? "border-l-2 border-l-red-500/60 bg-red-500/3"
                : ""
            }`}
          >
            {/* Tool icon */}
            <span className="text-lg shrink-0 w-7 text-center mt-0.5">
              {TOOL_ICONS[ev.toolName ?? ""] ??
                (ev.type === "AGENT_SPAWN" ? "🤖" :
                 ev.type === "CRON_RUN"    ? "⏰" :
                 ev.type === "SESSION_START" ? "▶️" : "📌")}
            </span>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-semibold border ${TYPE_BADGE[ev.type] ?? "bg-white/5 text-white/30 border-white/5"}`}>
                  {ev.type.replace("_", " ")}
                </span>
                {ev.toolName && (
                  <span className="text-xs font-semibold text-white/80">{ev.toolName}</span>
                )}
                {ev.model && (
                  <span className="text-[10px] text-white/20 font-mono">
                    {ev.model.split("/").pop()}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {ev.durationMs != null && (
                  <span className="text-[10px] text-white/30">{ev.durationMs}ms</span>
                )}
                {(ev.inputTokens || ev.outputTokens) && (
                  <span className="text-[10px] text-white/20 font-mono">
                    {ev.inputTokens ?? 0}↑ {ev.outputTokens ?? 0}↓
                  </span>
                )}
                {ev.error && (
                  <span className="text-[10px] text-red-400/70 truncate max-w-[200px]">{ev.error}</span>
                )}
              </div>

              <div className="mt-0.5 text-[10px] text-white/15 font-mono">
                {ev.sessionId.slice(0, 8)}… ·{" "}
                {formatDistanceToNow(new Date(ev.timestamp), { addSuffix: true })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
