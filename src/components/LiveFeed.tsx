"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";

interface EventMeta {
  cost_usd?:            number | null;
  cache_write_tokens?:  number | null;
  task?:                string | null;
  mode?:                string | null;
  runtime?:             string | null;
  model?:               string | null;
  label?:               string | null;
  [key: string]: unknown;
}

interface Event {
  id:             string;
  type:           string;
  toolName?:      string | null;
  sessionId:      string;
  subAgentId?:    string | null;
  timestamp:      string;
  durationMs?:    number | null;
  status?:        string | null;
  error?:         string | null;
  inputTokens?:   number | null;
  outputTokens?:  number | null;
  cacheTokens?:   number | null;
  model?:         string | null;
  input?:         unknown;
  output?:        unknown;
  metadata?:      EventMeta | null;
}

const TOOL_ICONS: Record<string, string> = {
  exec:            "⚡",
  browser:         "🌐",
  edit:            "✏️",
  read:            "📖",
  write:           "📝",
  web_search:      "🔍",
  web_fetch:       "🔗",
  memory_search:   "🧠",
  memory_get:      "💭",
  image:           "🖼️",
  tts:             "🔊",
  message:         "💬",
  cron:            "⏰",
  sessions_spawn:  "🤖",
  sessions_send:   "📡",
  canvas:          "🎨",
  process:         "🔄",
  llm_call:        "✨",
  nodes:           "📱",
  pdf:             "📄",
  gateway:         "🔧",
  subagents:       "👾",
};

const TYPE_BADGE: Record<string, string> = {
  TOOL_CALL:     "bg-blue-500/15    text-blue-300    border-blue-500/20",
  MESSAGE_SEND:  "bg-green-500/15   text-green-300   border-green-500/20",
  AGENT_SPAWN:   "bg-purple-500/15  text-purple-300  border-purple-500/20",
  CRON_RUN:      "bg-yellow-500/15  text-yellow-300  border-yellow-500/20",
  ERROR:         "bg-red-500/15     text-red-300     border-red-500/20",
  SESSION_START: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  SESSION_END:   "bg-gray-500/15    text-gray-400    border-gray-500/20",
  MODEL_SWITCH:  "bg-cyan-500/15    text-cyan-300    border-cyan-500/20",
};

// LLM tool calls have a special teal badge override
const LLM_BADGE = "bg-indigo-500/15 text-indigo-300 border-indigo-500/20";

const TRUNCATE_LIMIT = 800;

function formatCost(usd: number): string {
  if (usd < 0.001) return `$${(usd * 1000).toFixed(3)}m`;
  return `$${usd.toFixed(4)}`;
}

function JsonBlock({ data, label }: { data: unknown; label: string }) {
  const [expanded, setExpanded] = useState(false);
  if (data == null) return null;

  const raw = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  const needsTruncation = raw.length > TRUNCATE_LIMIT;
  const displayed = !expanded && needsTruncation ? raw.slice(0, TRUNCATE_LIMIT) + "…" : raw;

  return (
    <div className="mt-2">
      <div className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-1">
        {label}
      </div>
      <pre className="text-[11px] text-gray-300 bg-black/40 rounded-md p-2.5 overflow-x-auto whitespace-pre-wrap break-all font-mono leading-relaxed border border-white/5">
        {displayed}
      </pre>
      {needsTruncation && (
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          className="mt-1 text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
        >
          {expanded ? "▲ Show less" : "▼ Show more"} ({raw.length.toLocaleString()} chars)
        </button>
      )}
    </div>
  );
}

function EventDetail({ event }: { event: Event }) {
  const meta = event.metadata;
  const isLlm    = event.toolName === "llm_call";
  const isSpawn  = event.type === "AGENT_SPAWN";

  return (
    <div
      className="px-3 py-3 bg-white/[0.02] border-b border-white/[0.03] ml-10"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Metadata row */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-white/30 font-mono mb-2">
        <span><span className="text-white/15">Session </span>{event.sessionId}</span>
        <span><span className="text-white/15">Time </span>{new Date(event.timestamp).toISOString()}</span>
        {event.durationMs != null && (
          <span><span className="text-white/15">Duration </span>{event.durationMs}ms</span>
        )}
        {event.subAgentId && (
          <span><span className="text-white/15">Sub-agent </span>{event.subAgentId}</span>
        )}
      </div>

      {/* Agent spawn task preview */}
      {isSpawn && meta?.task && (
        <div className="mb-2 p-2.5 bg-purple-500/5 border border-purple-500/10 rounded-md">
          <div className="text-[10px] font-semibold text-purple-300/60 uppercase tracking-wider mb-1">Task</div>
          <p className="text-[11px] text-purple-100/70 leading-relaxed whitespace-pre-wrap break-words">{meta.task}</p>
          <div className="flex gap-3 mt-2 text-[10px] text-purple-300/40 font-mono">
            {meta.mode    && <span>mode: {meta.mode}</span>}
            {meta.runtime && <span>runtime: {meta.runtime}</span>}
            {meta.model   && <span>model: {meta.model.split("/").pop()}</span>}
            {meta.label   && <span>label: {meta.label}</span>}
          </div>
        </div>
      )}

      {/* LLM cost breakdown */}
      {isLlm && (
        <div className="mb-2 flex flex-wrap gap-3 text-[10px] font-mono">
          {event.inputTokens  != null && <span className="text-indigo-300/60">↑ {event.inputTokens.toLocaleString()} in</span>}
          {event.outputTokens != null && <span className="text-indigo-300/60">↓ {event.outputTokens.toLocaleString()} out</span>}
          {event.cacheTokens  != null && event.cacheTokens > 0 && (
            <span className="text-cyan-300/50">⚡ {event.cacheTokens.toLocaleString()} cached</span>
          )}
          {meta?.cache_write_tokens != null && meta.cache_write_tokens > 0 && (
            <span className="text-cyan-300/30">✍ {(meta.cache_write_tokens as number).toLocaleString()} cache-write</span>
          )}
          {meta?.cost_usd != null && (
            <span className="text-green-300/70 font-semibold">{formatCost(meta.cost_usd as number)}</span>
          )}
        </div>
      )}

      <JsonBlock data={event.input}  label="Input (params)"  />
      <JsonBlock data={event.output} label="Output (result)" />

      {/* Other metadata (non-special fields) */}
      {meta && !isSpawn && !isLlm && Object.keys(meta).some(k => meta[k] != null) && (
        <JsonBlock data={meta} label="Metadata" />
      )}

      {event.error && (
        <div className="mt-2">
          <div className="text-[10px] font-semibold text-red-400/60 uppercase tracking-wider mb-1">Error</div>
          <pre className="text-[11px] text-red-300 bg-red-500/5 rounded-md p-2.5 overflow-x-auto whitespace-pre-wrap break-all font-mono border border-red-500/10">
            {event.error}
          </pre>
        </div>
      )}
    </div>
  );
}

export function LiveFeed({
  initialEvents = [],
  onConnectionChange,
}: {
  initialEvents?: Event[];
  onConnectionChange?: (connected: boolean) => void;
}) {
  const [events,     setEvents]     = useState<Event[]>(initialEvents);
  const [connected,  setConnected]  = useState(false);
  const [filter,     setFilter]     = useState<string>("all");
  const [newCount,   setNewCount]   = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const setConn = useCallback((v: boolean) => {
    setConnected(v);
    onConnectionChange?.(v);
  }, [onConnectionChange]);

  useEffect(() => {
    const es = new EventSource("/api/live");
    es.onopen    = () => setConn(true);
    es.onerror   = () => setConn(false);
    es.onmessage = (e) => {
      const event: Event = JSON.parse(e.data);
      setEvents((prev) => [event, ...prev].slice(0, 500));
      setNewCount((n) => n + 1);
    };
    return () => es.close();
  }, [setConn]);

  const filtered = filter === "all"    ? events
    : filter === "errors"  ? events.filter(e => e.status === "error" || !!e.error)
    : filter === "tools"   ? events.filter(e => e.type === "TOOL_CALL" && e.toolName !== "llm_call")
    : filter === "agents"  ? events.filter(e => e.type === "AGENT_SPAWN")
    : filter === "llm"     ? events.filter(e => e.toolName === "llm_call")
    : events;

  const filters = [
    { id: "all",    label: "All" },
    { id: "tools",  label: "⚡ Tools" },
    { id: "agents", label: "🤖 Agents" },
    { id: "llm",    label: "✨ LLM" },
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

        {filtered.map((ev) => {
          const isLlm   = ev.toolName === "llm_call";
          const isSpawn = ev.type === "AGENT_SPAWN";
          const meta    = ev.metadata;
          const badgeCls = isLlm ? LLM_BADGE : (TYPE_BADGE[ev.type] ?? "bg-white/5 text-white/30 border-white/5");
          const badgeLabel = isLlm ? "LLM CALL" : ev.type.replace(/_/g, " ");
          const hasDetail = ev.input != null || ev.output != null || isSpawn || isLlm;

          return (
            <div key={ev.id}>
              <div
                onClick={() => setExpandedId(expandedId === ev.id ? null : ev.id)}
                className={`flex items-start gap-3 px-3 py-2.5 border-b border-white/[0.03] transition-colors cursor-pointer hover:bg-white/[0.03] ${
                  expandedId === ev.id ? "bg-white/[0.04]" : ""
                } ${
                  ev.status === "error" || ev.error
                    ? "border-l-2 border-l-red-500/60"
                    : isSpawn
                    ? "border-l-2 border-l-purple-500/40"
                    : ""
                }`}
              >
                {/* Icon */}
                <span className="text-lg shrink-0 w-7 text-center mt-0.5">
                  {TOOL_ICONS[ev.toolName ?? ""] ??
                    (ev.type === "CRON_RUN"     ? "⏰" :
                     ev.type === "SESSION_START" ? "▶️" :
                     ev.type === "SESSION_END"   ? "⏹️" :
                     ev.type === "MESSAGE_SEND"  ? "💬" : "📌")}
                </span>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-semibold border ${badgeCls}`}>
                      {badgeLabel}
                    </span>

                    {/* Tool name (skip for llm_call — badge says it all) */}
                    {ev.toolName && !isLlm && (
                      <span className="text-xs font-semibold text-white/80">{ev.toolName}</span>
                    )}

                    {/* For agent spawn: show label or task snippet */}
                    {isSpawn && (
                      <span className="text-[10px] text-purple-200/60 truncate max-w-[180px]">
                        {meta?.label ?? (meta?.task ? (meta.task as string).slice(0, 60) + "…" : "")}
                      </span>
                    )}

                    {/* Model name */}
                    {ev.model && (
                      <span className="text-[10px] text-white/20 font-mono">
                        {ev.model.split("/").pop()}
                      </span>
                    )}

                    {/* Cost chip for LLM calls */}
                    {isLlm && meta?.cost_usd != null && (
                      <span className="text-[9px] text-green-400/70 font-mono ml-1">
                        {formatCost(meta.cost_usd as number)}
                      </span>
                    )}

                    {/* Expand chevron */}
                    {hasDetail && (
                      <span className="text-[9px] text-white/20 ml-auto">
                        {expandedId === ev.id ? "▲" : "▼"}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {ev.durationMs != null && (
                      <span className="text-[10px] text-white/30">{ev.durationMs}ms</span>
                    )}
                    {isLlm && (ev.inputTokens || ev.outputTokens) && (
                      <span className="text-[10px] text-indigo-300/40 font-mono">
                        {ev.inputTokens ?? 0}↑ {ev.outputTokens ?? 0}↓
                        {ev.cacheTokens ? ` ⚡${ev.cacheTokens}` : ""}
                      </span>
                    )}
                    {!isLlm && (ev.inputTokens || ev.outputTokens) && (
                      <span className="text-[10px] text-white/20 font-mono">
                        {ev.inputTokens ?? 0}↑ {ev.outputTokens ?? 0}↓
                      </span>
                    )}
                    {ev.error && (
                      <span className="text-[10px] text-red-400/70 truncate max-w-[200px]">{ev.error}</span>
                    )}
                    {/* Sub-agent session key */}
                    {isSpawn && ev.subAgentId && (
                      <span className="text-[10px] text-purple-300/30 font-mono truncate max-w-[120px]">
                        → {ev.subAgentId}
                      </span>
                    )}
                  </div>

                  <div className="mt-0.5 text-[10px] text-white/15 font-mono">
                    {ev.sessionId.slice(0, 8)}… ·{" "}
                    {formatDistanceToNow(new Date(ev.timestamp), { addSuffix: true })}
                  </div>
                </div>
              </div>

              {expandedId === ev.id && <EventDetail event={ev} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
