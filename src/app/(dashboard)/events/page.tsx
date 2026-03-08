"use client";

import { useState, useMemo, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { formatDistanceToNow, format, subHours } from "date-fns";
import { useDashboard } from "../layout";
import type { DashboardEvent } from "../layout";

// ── Type badge colours (matches LiveFeed) ───────────────────────────
const TYPE_BADGE: Record<string, string> = {
  TOOL_CALL:        "bg-blue-500/15    text-blue-300    border-blue-500/20",
  MESSAGE_SEND:     "bg-green-500/15   text-green-300   border-green-500/20",
  MESSAGE_SENT:     "bg-green-500/15   text-green-300   border-green-500/20",
  MESSAGE_RECEIVED: "bg-sky-500/15     text-sky-300     border-sky-500/20",
  AGENT_SPAWN:      "bg-purple-500/15  text-purple-300  border-purple-500/20",
  AGENT_START:      "bg-violet-500/15  text-violet-300  border-violet-500/20",
  AGENT_END:        "bg-violet-500/10  text-violet-400  border-violet-500/15",
  SUBAGENT_SPAWNING:"bg-purple-500/10  text-purple-400  border-purple-500/15",
  SUBAGENT_ENDED:   "bg-purple-500/10  text-purple-400  border-purple-500/15",
  CRON_RUN:         "bg-yellow-500/15  text-yellow-300  border-yellow-500/20",
  ERROR:            "bg-red-500/15     text-red-300     border-red-500/20",
  SESSION_START:    "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  SESSION_END:      "bg-gray-500/15    text-gray-400    border-gray-500/20",
  MODEL_SWITCH:     "bg-cyan-500/15    text-cyan-300    border-cyan-500/20",
  LLM_OUTPUT:       "bg-violet-500/15  text-violet-300  border-violet-500/20",
};

// Left border accent per event type
const TYPE_BORDER: Record<string, string> = {
  TOOL_CALL:         "border-l-blue-500/40",
  MESSAGE_SEND:      "border-l-green-500/40",
  MESSAGE_SENT:      "border-l-green-500/40",
  MESSAGE_RECEIVED:  "border-l-sky-500/40",
  AGENT_SPAWN:       "border-l-purple-500/60",
  AGENT_START:       "border-l-violet-500/40",
  AGENT_END:         "border-l-violet-500/20",
  SUBAGENT_SPAWNING: "border-l-purple-400/40",
  SUBAGENT_ENDED:    "border-l-purple-400/20",
  CRON_RUN:          "border-l-yellow-500/40",
  ERROR:             "border-l-red-500/70",
  SESSION_START:     "border-l-emerald-500/40",
  SESSION_END:       "border-l-gray-500/20",
  MODEL_SWITCH:      "border-l-cyan-500/40",
  LLM_OUTPUT:        "border-l-violet-500/50",
};

const TYPE_LABELS: Record<string, string> = {
  // Tool & Compute
  TOOL_CALL:         "Tool Call",
  LLM_OUTPUT:        "LLM Output",
  // Messaging
  MESSAGE_SEND:      "Message",
  MESSAGE_SENT:      "Message Sent",
  MESSAGE_RECEIVED:  "Message Received",
  // Agents
  AGENT_START:       "Agent Start",
  AGENT_END:         "Agent End",
  AGENT_SPAWN:       "Agent Spawn",
  SUBAGENT_SPAWNING: "Subagent Spawning",
  SUBAGENT_ENDED:    "Subagent Ended",
  // System
  CRON_RUN:          "Cron Run",
  SESSION_START:     "Session Start",
  SESSION_END:       "Session End",
  MODEL_SWITCH:      "Model Switch",
  ERROR:             "Error",
};

// Grouped for the filter dropdown
const TYPE_GROUPS: { label: string; types: string[] }[] = [
  { label: "Tool & Compute", types: ["TOOL_CALL", "LLM_OUTPUT"] },
  { label: "Messaging",      types: ["MESSAGE_SEND", "MESSAGE_SENT", "MESSAGE_RECEIVED"] },
  { label: "Agents",         types: ["AGENT_START", "AGENT_END", "AGENT_SPAWN", "SUBAGENT_SPAWNING", "SUBAGENT_ENDED"] },
  { label: "System",         types: ["CRON_RUN", "SESSION_START", "SESSION_END", "MODEL_SWITCH", "ERROR"] },
];

// ── Inline JSON viewer ──────────────────────────────────────────────
function JsonViewer({ data, label }: { data: unknown; label: string }) {
  const [open, setOpen] = useState(false);

  if (data === null || data === undefined) return null;

  const formatted = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  const isLong = formatted.length > 200;

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[11px] font-medium text-white/40 hover:text-white/60 transition-colors min-h-[44px] sm:min-h-0"
      >
        <svg
          className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="9,18 15,12 9,6" />
        </svg>
        {label}
        <span className="text-white/20 font-normal">
          {typeof data === "object" && data !== null
            ? Array.isArray(data)
              ? `[${(data as unknown[]).length}]`
              : `{${Object.keys(data as object).length}}`
            : `(${typeof data})`}
        </span>
      </button>
      {open && (
        <pre className="mt-1.5 p-3 rounded-lg bg-black/40 border border-white/[0.06] text-[11px] font-mono text-white/60 overflow-x-auto max-h-[400px] overflow-y-auto leading-relaxed">
          <code>
            {isLong ? <JsonTree data={data} /> : formatted}
          </code>
        </pre>
      )}
    </div>
  );
}

function JsonTree({ data, depth = 0 }: { data: unknown; depth?: number }) {
  const indent = "  ".repeat(depth);

  if (data === null) return <span className="text-orange-300/70">null</span>;
  if (data === undefined) return <span className="text-white/30">undefined</span>;
  if (typeof data === "boolean")
    return <span className="text-orange-300/70">{String(data)}</span>;
  if (typeof data === "number")
    return <span className="text-blue-300/80">{String(data)}</span>;
  if (typeof data === "string") {
    if (data.length > 500) {
      return <span className="text-emerald-300/70">&quot;{data.slice(0, 500)}...&quot;</span>;
    }
    return <span className="text-emerald-300/70">&quot;{data}&quot;</span>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return <span>{"[]"}</span>;
    return (
      <span>
        {"[\n"}
        {data.map((item, i) => (
          <span key={i}>
            {indent}{"  "}<JsonTree data={item} depth={depth + 1} />
            {i < data.length - 1 ? ",\n" : "\n"}
          </span>
        ))}
        {indent}{"]"}
      </span>
    );
  }

  if (typeof data === "object") {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) return <span>{"{}"}</span>;
    return (
      <span>
        {"{\n"}
        {entries.map(([key, val], i) => (
          <span key={key}>
            {indent}{"  "}<span className="text-violet-300/70">&quot;{key}&quot;</span>:{" "}
            <JsonTree data={val} depth={depth + 1} />
            {i < entries.length - 1 ? ",\n" : "\n"}
          </span>
        ))}
        {indent}{"}"}
      </span>
    );
  }

  return <span>{String(data)}</span>;
}

// ── Inline preview helpers ───────────────────────────────────────────
function parseJsonVal(val: unknown): unknown {
  if (val == null) return null;
  if (typeof val === "object") return val;
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return val; }
  }
  return val;
}

function strVal(val: unknown): string {
  if (val == null) return "";
  if (typeof val === "string") return val;
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

function truncStr(str: string, len: number): string {
  return str.length <= len ? str : str.slice(0, len) + "…";
}

/** Returns a short preview string for an event, or null if nothing to show. */
function getEventPreview(ev: DashboardEvent): string | null {
  const type = ev.type;
  const toolName = ev.toolName;
  const input = ev.input;
  const output = ev.output;
  const error = ev.error;
  const meta = ev.metadata as Record<string, unknown> | null | undefined;
  const ms = (v: unknown): string => v != null ? String(v) : "";

  // TOOL_CALL: 🔧 tool_name(key: "val", …) → output preview
  if (type === "TOOL_CALL" && toolName) {
    const parsedInput = parseJsonVal(input);
    let argPreview = "";
    if (parsedInput && typeof parsedInput === "object" && !Array.isArray(parsedInput)) {
      const entries = Object.entries(parsedInput as Record<string, unknown>).slice(0, 3);
      argPreview = entries.map(([k, v]) => {
        const vStr = typeof v === "string"
          ? `"${truncStr(v, 20)}"`
          : truncStr(strVal(v), 20);
        return `${k}: ${vStr}`;
      }).join(", ");
    } else if (parsedInput != null) {
      argPreview = truncStr(strVal(parsedInput), 40);
    }
    const parsedOutput = parseJsonVal(output);
    const outStr = parsedOutput != null ? truncStr(strVal(parsedOutput).replace(/\n/g, " "), 80) : "";
    const inputPart = `🔧 ${toolName}(${argPreview})`;
    return outStr ? `${inputPart} → ${outStr}` : inputPart;
  }

  // LLM_OUTPUT / llm_call: beginning of output text
  if (type === "LLM_OUTPUT" || toolName === "llm_call") {
    const parsedOutput = parseJsonVal(output);
    if (parsedOutput != null) {
      const s = strVal(parsedOutput).replace(/\n/g, " ").trim();
      if (s) return "✨ " + truncStr(s, 100);
    }
    return null;
  }

  // MESSAGE_RECEIVED: beginning of message
  if (type === "MESSAGE_RECEIVED") {
    const preview = meta?.content_preview;
    if (preview) return "📨 " + truncStr(ms(preview), 100);
    const parsed = parseJsonVal(input);
    if (parsed != null) return "📨 " + truncStr(strVal(parsed).replace(/\n/g, " "), 100);
    return null;
  }

  // MESSAGE_SENT / MESSAGE_SEND: beginning of response
  if (type === "MESSAGE_SENT" || type === "MESSAGE_SEND") {
    const preview = meta?.content_preview;
    if (preview) return "📤 " + truncStr(ms(preview), 100);
    const parsed = parseJsonVal(output);
    if (parsed != null) return "📤 " + truncStr(strVal(parsed).replace(/\n/g, " "), 100);
    return null;
  }

  // CRON_RUN: cron trigger + status
  if (type === "CRON_RUN") {
    const cronName = ms(meta?.trigger ?? meta?.cron_name ?? "");
    const status   = ev.status ?? "";
    if (cronName) return `⏰ ${cronName}${status ? ` · ${status}` : ""}`;
    return null;
  }

  // AGENT_SPAWN: label + task preview
  if (type === "AGENT_SPAWN") {
    const label = ms(meta?.label ?? "");
    const task  = ms(meta?.task ?? "");
    if (label) return `🤖 ${label}${task ? " · " + truncStr(task, 60) : ""}`;
    if (task)  return `🤖 ${truncStr(task, 80)}`;
    return null;
  }

  // ERROR: error message
  if (type === "ERROR" || error) {
    const errMsg = error || ms(meta?.error ?? "");
    if (errMsg) return "🔴 " + truncStr(errMsg, 80);
    return null;
  }

  return null;
}

/** Inline preview chip — mobile shows 60 chars, desktop 120. */
function EventInlinePreview({ preview }: { preview: string }) {
  const [expanded, setExpanded] = useState(false);
  const SHORT_MOBILE  = 60;
  const SHORT_DESKTOP = 120;
  const isLongMobile  = preview.length > SHORT_MOBILE;
  const isLongDesktop = preview.length > SHORT_DESKTOP;

  return (
    <p className="text-xs text-muted-foreground mt-0.5 font-mono leading-snug break-all">
      {/* Mobile view */}
      <span className="sm:hidden">
        {isLongMobile && !expanded ? truncStr(preview, SHORT_MOBILE) : preview}
        {isLongMobile && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="ml-1 text-[9px] text-blue-400/60 hover:text-blue-300 transition-colors align-middle"
          >
            {expanded ? "▲" : "▼"}
          </button>
        )}
      </span>
      {/* Desktop view */}
      <span className="hidden sm:inline">
        {isLongDesktop && !expanded ? truncStr(preview, SHORT_DESKTOP) : preview}
        {isLongDesktop && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="ml-1 text-[9px] text-blue-400/60 hover:text-blue-300 transition-colors align-middle"
          >
            {expanded ? "▲ less" : "▼ more"}
          </button>
        )}
      </span>
    </p>
  );
}

// ── Copy button ─────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    },
    [text],
  );

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center justify-center w-8 h-8 sm:w-5 sm:h-5 rounded text-white/20 hover:text-white/50 hover:bg-white/5 transition-colors"
      title="Copy"
    >
      {copied ? (
        <svg className="w-4 h-4 sm:w-3 sm:h-3 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="20,6 9,17 4,12" />
        </svg>
      ) : (
        <svg className="w-4 h-4 sm:w-3 sm:h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
        </svg>
      )}
    </button>
  );
}

// ── Event detail panel ──────────────────────────────────────────────
function EventDetail({ event }: { event: DashboardEvent }) {
  const ts = new Date(event.timestamp);

  return (
    <div className="px-4 py-4 bg-white/[0.02] border-t border-white/[0.04] animate-fade-in">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        {/* Event ID */}
        <div>
          <span className="text-[10px] text-white/30 uppercase tracking-wider font-medium">Event ID</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs font-mono text-white/60 truncate">{event.id}</span>
            <CopyButton text={event.id} />
          </div>
        </div>

        {/* Session */}
        <div>
          <span className="text-[10px] text-white/30 uppercase tracking-wider font-medium">Session</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs font-mono text-blue-300/70 truncate">{event.sessionId}</span>
            <CopyButton text={event.sessionId} />
          </div>
        </div>

        {/* Timestamp */}
        <div>
          <span className="text-[10px] text-white/30 uppercase tracking-wider font-medium">Timestamp</span>
          <div className="text-xs text-white/60 mt-0.5">
            {format(ts, "yyyy-MM-dd HH:mm:ss.SSS")}
          </div>
        </div>

        {/* Type */}
        <div>
          <span className="text-[10px] text-white/30 uppercase tracking-wider font-medium">Type</span>
          <div className="mt-0.5">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                TYPE_BADGE[event.type] ?? "bg-white/5 text-white/30 border-white/5"
              }`}
            >
              {event.type.replace(/_/g, " ")}
            </span>
          </div>
        </div>

        {/* Tool name */}
        {event.toolName && (
          <div>
            <span className="text-[10px] text-white/30 uppercase tracking-wider font-medium">Tool</span>
            <div className="text-xs font-semibold text-white/70 mt-0.5">{event.toolName}</div>
          </div>
        )}

        {/* Model */}
        {event.model && (
          <div>
            <span className="text-[10px] text-white/30 uppercase tracking-wider font-medium">Model</span>
            <div className="text-xs font-mono text-white/50 mt-0.5">{event.model}</div>
          </div>
        )}

        {/* Duration */}
        {event.durationMs != null && (
          <div>
            <span className="text-[10px] text-white/30 uppercase tracking-wider font-medium">Duration</span>
            <div className="text-xs text-white/60 mt-0.5 tabular-nums">{event.durationMs.toLocaleString()}ms</div>
          </div>
        )}

        {/* Tokens */}
        {(event.inputTokens || event.outputTokens || event.cacheTokens) && (
          <div>
            <span className="text-[10px] text-white/30 uppercase tracking-wider font-medium">Tokens</span>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-white/50 tabular-nums font-mono">
              {event.inputTokens != null && (
                <span>
                  <span className="text-white/30">in:</span> {event.inputTokens.toLocaleString()}
                </span>
              )}
              {event.outputTokens != null && (
                <span>
                  <span className="text-white/30">out:</span> {event.outputTokens.toLocaleString()}
                </span>
              )}
              {event.cacheTokens != null && (
                <span>
                  <span className="text-white/30">cache:</span> {event.cacheTokens.toLocaleString()}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Status */}
        <div>
          <span className="text-[10px] text-white/30 uppercase tracking-wider font-medium">Status</span>
          <div className="mt-0.5">
            {event.status === "error" || event.error ? (
              <span className="inline-flex items-center gap-1 text-xs text-red-400">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                Error
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                OK
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Error message */}
      {event.error && (
        <div className="mb-3 p-3 rounded-lg bg-red-500/5 border border-red-500/15">
          <span className="text-[10px] text-red-400/60 uppercase tracking-wider font-medium">Error</span>
          <p className="text-xs text-red-300/80 mt-1 font-mono whitespace-pre-wrap break-all">{event.error}</p>
        </div>
      )}

      {/* JSON viewers */}
      <JsonViewer data={event.input} label="Input" />
      <JsonViewer data={event.output} label="Output" />
      <JsonViewer data={event.metadata} label="Metadata" />
    </div>
  );
}

// ── Mobile Event Card ───────────────────────────────────────────────
function MobileEventCard({ 
  event, 
  isSelected, 
  onSelect 
}: { 
  event: DashboardEvent; 
  isSelected: boolean;
  onSelect: () => void;
}) {
  const ts = new Date(event.timestamp);
  const isError = event.status === "error" || !!event.error;

  return (
    <div>
      <div
        onClick={onSelect}
        className={`rounded-xl border border-l-2 p-3 transition-colors cursor-pointer ${
          isError
            ? "border-l-red-500/70 border-red-500/20 bg-red-500/[0.03] active:bg-red-500/[0.06]"
            : `${TYPE_BORDER[event.type] ?? "border-l-transparent"} border-white/[0.06] bg-white/[0.02] active:bg-white/[0.05]`
        } ${isSelected ? "bg-white/[0.06] border-white/10" : ""}`}
      >
        {/* Row 1: Type badge + Tool name */}
        <div className="flex items-center gap-2 mb-2">
          <span
            className={`inline-flex items-center px-2 py-1 rounded-md text-[10px] font-semibold border ${
              TYPE_BADGE[event.type] ?? "bg-white/5 text-white/30 border-white/5"
            }`}
          >
            {event.type.replace(/_/g, " ")}
          </span>
          {event.toolName && (
            <span className="text-sm font-semibold text-white/70 truncate flex-1">{event.toolName}</span>
          )}
          {/* Status indicator */}
          <span className={`w-2 h-2 rounded-full shrink-0 ${isError ? "bg-red-400" : "bg-emerald-400/70"}`} />
        </div>

        {/* Inline input/output preview */}
        {(() => { const p = getEventPreview(event); return p ? <EventInlinePreview preview={p} /> : null; })()}

        {/* Row 2: Session ID + Timestamp */}
        <div className="flex items-center justify-between gap-2 mb-2 text-[11px]">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-mono text-white/35 truncate">{event.sessionId.slice(0, 12)}…</span>
            <CopyButton text={event.sessionId} />
          </div>
          <div className="flex items-center gap-2 text-white/30 shrink-0">
            <span className="tabular-nums">{format(ts, "HH:mm:ss")}</span>
            <span className="text-white/15">·</span>
            <span>{formatDistanceToNow(ts, { addSuffix: true })}</span>
          </div>
        </div>

        {/* Row 3: Duration + Tokens + Model */}
        <div className="flex items-center gap-3 text-[10px] text-white/40 flex-wrap">
          {event.durationMs != null && (
            <span className="tabular-nums">
              ⏱ {event.durationMs >= 1000 ? `${(event.durationMs / 1000).toFixed(1)}s` : `${event.durationMs}ms`}
            </span>
          )}
          {(event.inputTokens || event.outputTokens) && (
            <span className="font-mono tabular-nums">
              🔤 {(event.inputTokens ?? 0).toLocaleString()}/{(event.outputTokens ?? 0).toLocaleString()}
            </span>
          )}
          {event.model && (
            <span className="font-mono truncate max-w-[120px]">
              🧠 {event.model.split("/").pop()}
            </span>
          )}
        </div>

        {/* Error preview */}
        {event.error && (
          <div className="mt-2 text-[11px] text-red-400/70 truncate">
            ⚠️ {event.error}
          </div>
        )}
      </div>

      {/* Expanded detail */}
      {isSelected && <EventDetail event={event} />}
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────
function EventsPageInner() {
  const { events: sseEvents, connState, stats } = useDashboard();
  const searchParams = useSearchParams();
  const sessionFilter = searchParams.get("session") ?? "";
  const timeStartParam = searchParams.get("timeStart");
  const timeEndParam = searchParams.get("timeEnd");
  const statusParam = searchParams.get("status");

  // Filters
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState(statusParam ?? "all");
  const [timeFilter, setTimeFilter] = useState("all");
  const [sessionSearch, setSessionSearch] = useState(sessionFilter);
  const [customTimeRange, setCustomTimeRange] = useState<{ start: number; end: number } | null>(
    timeStartParam && timeEndParam ? { start: parseInt(timeStartParam), end: parseInt(timeEndParam) } : null
  );

  // Selection
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Pagination: extra events loaded from API beyond SSE buffer
  const [extraEvents, setExtraEvents] = useState<DashboardEvent[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Merge SSE + extra, deduplicated by id
  const allEvents = useMemo(() => {
    const seen = new Set<string>();
    const merged: DashboardEvent[] = [];
    for (const ev of sseEvents) {
      if (!seen.has(ev.id)) {
        seen.add(ev.id);
        merged.push(ev);
      }
    }
    for (const ev of extraEvents) {
      if (!seen.has(ev.id)) {
        seen.add(ev.id);
        merged.push(ev);
      }
    }
    return merged;
  }, [sseEvents, extraEvents]);

  // Apply filters
  const filteredEvents = useMemo(() => {
    let result = allEvents;

    // Custom time range filter (from analytics drill-down)
    if (customTimeRange) {
      result = result.filter((e) => {
        const t = new Date(e.timestamp).getTime();
        return t >= customTimeRange.start && t <= customTimeRange.end;
      });
    }

    // Time filter
    if (timeFilter !== "all") {
      const hours = timeFilter === "1h" ? 1 : timeFilter === "6h" ? 6 : 24;
      const cutoff = subHours(new Date(), hours);
      result = result.filter((e) => new Date(e.timestamp) >= cutoff);
    }

    // Type filter
    if (typeFilter !== "all") {
      result = result.filter((e) => e.type === typeFilter);
    }

    // Status filter
    if (statusFilter === "ok") {
      result = result.filter((e) => e.status !== "error" && !e.error);
    } else if (statusFilter === "error") {
      result = result.filter((e) => e.status === "error" || !!e.error);
    }

    // Session filter
    if (sessionSearch.trim()) {
      const sq = sessionSearch.toLowerCase();
      result = result.filter((e) => e.sessionId.toLowerCase().includes(sq));
    }

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) =>
          (e.toolName && e.toolName.toLowerCase().includes(q)) ||
          e.sessionId.toLowerCase().includes(q) ||
          (e.error && e.error.toLowerCase().includes(q)) ||
          e.type.toLowerCase().includes(q) ||
          (e.model && e.model.toLowerCase().includes(q)),
      );
    }

    return result;
  }, [allEvents, search, typeFilter, statusFilter, timeFilter, sessionSearch, customTimeRange]);

  // Display first 100 (paginated in UI from the merged set)
  const displayedEvents = filteredEvents.slice(0, 100 + extraEvents.length);

  // Load more from API
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const lastEvent = allEvents[allEvents.length - 1];
      if (!lastEvent) {
        setHasMore(false);
        return;
      }
      const res = await fetch(`/api/events?limit=100&cursor=${lastEvent.id}`);
      const data = await res.json();
      if (data.events && data.events.length > 0) {
        setExtraEvents((prev) => [...prev, ...data.events]);
        setHasMore(data.nextCursor !== null);
      } else {
        setHasMore(false);
      }
    } catch {
      // silently fail
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, allEvents]);

  const errorCount = useMemo(
    () => allEvents.filter((e) => e.status === "error" || !!e.error).length,
    [allEvents],
  );

  return (
    <div className="flex flex-col h-full">
      {/* ── Page header ──────────────────────────────────────────── */}
      <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-white/[0.06]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-lg font-semibold text-white">Events</h1>
              <p className="text-xs text-white/30 mt-0.5 hidden sm:block">
                Browse and inspect all captured events
              </p>
            </div>
            {/* Quick errors filter badge — shown when there are errors in the last 24h */}
            {(stats?.errorsLast24h ?? 0) > 0 && (
              <button
                onClick={() => setStatusFilter(statusFilter === "error" ? "all" : "error")}
                title={statusFilter === "error" ? "Clear error filter" : `Show only errors (${stats!.errorsLast24h} in last 24h)`}
                className={`inline-flex items-center gap-1.5 px-3 py-2 sm:px-2.5 sm:py-1 rounded-xl sm:rounded-lg border font-semibold text-sm sm:text-xs tabular-nums transition-all min-h-[44px] sm:min-h-0 ${
                  statusFilter === "error"
                    ? "bg-red-500/25 text-red-200 border-red-500/50 shadow-[0_0_12px_rgba(239,68,68,0.15)]"
                    : "bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/50"
                }`}
              >
                🔴 <span>{stats!.errorsLast24h.toLocaleString()} {stats!.errorsLast24h === 1 ? "error" : "errors"}</span>
                {statusFilter === "error" && (
                  <svg className="w-3 h-3 ml-0.5 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                )}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-[10px] text-white/20 tabular-nums">
              {filteredEvents.length.toLocaleString()}
            </span>
            {errorCount > 0 && (
              <button
                onClick={() => setStatusFilter(statusFilter === "error" ? "all" : "error")}
                title={statusFilter === "error" ? "Clear error filter" : "Show only errors"}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold tabular-nums transition-colors min-h-[44px] sm:min-h-[unset] ${
                  statusFilter === "error"
                    ? "bg-red-500/20 text-red-300 border border-red-500/40"
                    : "bg-red-500/10 text-red-400/80 border border-red-500/20 hover:bg-red-500/15"
                }`}
              >
                {errorCount} {errorCount === 1 ? "err" : "err"}
              </button>
            )}
            {connState === "connected" && (
              <span className="flex items-center gap-1 text-[10px] text-emerald-400/60">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="hidden sm:inline">Live</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Filter bar ───────────────────────────────────────────── */}
      <div className="shrink-0 px-4 sm:px-6 py-3 border-b border-white/[0.06] bg-white/[0.01]">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          {/* Search - full width on mobile */}
          <div className="relative w-full sm:flex-1 sm:min-w-[200px] sm:max-w-md">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-3.5 sm:h-3.5 text-white/20"
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
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tool, session, error..."
              className="w-full pl-10 sm:pl-9 pr-10 py-3 sm:py-2 rounded-xl sm:rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm sm:text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-white/15 focus:bg-white/[0.06] transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 sm:w-auto sm:h-auto flex items-center justify-center text-white/20 hover:text-white/40"
              >
                <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>

          {/* Session filter */}
          <div className="relative w-full sm:w-auto sm:min-w-[160px] sm:max-w-[220px]">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-3.5 sm:h-3.5 text-white/20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="2" y="3" width="6" height="18" rx="1" />
              <rect x="10" y="3" width="6" height="18" rx="1" />
              <rect x="18" y="3" width="4" height="18" rx="1" />
            </svg>
            <input
              type="text"
              value={sessionSearch}
              onChange={(e) => setSessionSearch(e.target.value)}
              placeholder="Filter by session..."
              className="w-full pl-10 sm:pl-9 pr-10 py-3 sm:py-2 rounded-xl sm:rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm sm:text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-white/15 focus:bg-white/[0.06] transition-colors"
            />
            {sessionSearch && (
              <button
                onClick={() => setSessionSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 sm:w-auto sm:h-auto flex items-center justify-center text-white/20 hover:text-white/40"
              >
                <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>

          {/* Custom time range filter badge (from analytics drill-down) */}
          {customTimeRange && (
            <div className="flex items-center gap-1.5 shrink-0 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-[11px] text-red-300/80">
              <span>⏱ Time range filter active</span>
              <button onClick={() => setCustomTimeRange(null)} className="text-red-300/50 hover:text-red-300/80 transition-colors">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          )}

          {/* Active session filter badge (shown when coming from URL) */}
          {sessionFilter && sessionSearch === sessionFilter && (
            <div className="flex items-center gap-1.5 shrink-0 px-2.5 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-300/80">
              <span>Filtered: {sessionFilter.slice(0, 12)}{sessionFilter.length > 12 ? "…" : ""}</span>
              <button
                onClick={() => setSessionSearch("")}
                className="text-blue-300/50 hover:text-blue-300/80 transition-colors"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )}

          {/* Filters row - horizontal scroll on mobile */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0">
            {/* Errors quick-filter chip */}
            {errorCount > 0 && (
              <button
                onClick={() => setStatusFilter(statusFilter === "error" ? "all" : "error")}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2.5 sm:py-2 rounded-xl sm:rounded-lg border text-sm sm:text-xs font-semibold transition-colors min-h-[44px] sm:min-h-0 ${
                  statusFilter === "error"
                    ? "bg-red-500/15 text-red-300 border-red-500/30"
                    : "bg-white/[0.04] text-red-400/70 border-white/[0.06] hover:border-red-500/20 hover:bg-red-500/5"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                Errors
                <span
                  className={`inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full text-[10px] font-bold tabular-nums ${
                    statusFilter === "error" ? "bg-red-500/30 text-red-200" : "bg-red-500/15 text-red-400"
                  }`}
                >
                  {errorCount}
                </span>
              </button>
            )}

            {/* Type filter */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="shrink-0 px-3 py-2.5 sm:py-2 rounded-xl sm:rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm sm:text-xs text-white/70 focus:outline-none focus:border-white/15 transition-colors appearance-none cursor-pointer pr-8 bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22rgba(255%2C255%2C255%2C0.3)%22%20stroke-width%3D%222%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_8px_center]"
            >
              <option value="all">All Types</option>
              {TYPE_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.types.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="shrink-0 px-3 py-2.5 sm:py-2 rounded-xl sm:rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm sm:text-xs text-white/70 focus:outline-none focus:border-white/15 transition-colors appearance-none cursor-pointer pr-8 bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22rgba(255%2C255%2C255%2C0.3)%22%20stroke-width%3D%222%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_8px_center]"
            >
              <option value="all">All Status</option>
              <option value="ok">OK</option>
              <option value="error">Error</option>
            </select>

            {/* Time filter - pill buttons */}
            <div className="flex items-center rounded-xl sm:rounded-lg bg-white/[0.04] border border-white/[0.06] overflow-hidden shrink-0">
              {(["1h", "6h", "24h", "all"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTimeFilter(t)}
                  className={`px-3 py-2.5 sm:py-2 text-sm sm:text-xs font-medium transition-colors min-w-[44px] ${
                    timeFilter === t
                      ? "bg-white/10 text-white"
                      : "text-white/30 active:text-white/50"
                  }`}
                >
                  {t === "all" ? "All" : t.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats / count bar ────────────────────────────────────── */}
      <div className="shrink-0 px-4 sm:px-6 py-2 border-b border-white/[0.04] bg-white/[0.01] flex items-center gap-4 overflow-x-auto scrollbar-none">
        {/* Showing X of Y */}
        <span className="text-[11px] text-white/30 tabular-nums shrink-0">
          Showing{" "}
          <span className="text-white/50 font-medium">{filteredEvents.length.toLocaleString()}</span>
          {" "}of{" "}
          <span className="text-white/50 font-medium">{allEvents.length.toLocaleString()}</span>
          {" "}events
        </span>

        {/* Breakdown stats (desktop only) */}
        {filteredEvents.length > 0 && (
          <div className="hidden sm:flex items-center gap-4 overflow-x-auto scrollbar-none">
            {[
              { label: "Tool calls", count: filteredEvents.filter(e => e.type === "TOOL_CALL").length, color: "text-blue-400" },
              { label: "Messages", count: filteredEvents.filter(e => ["MESSAGE_SEND","MESSAGE_SENT","MESSAGE_RECEIVED"].includes(e.type)).length, color: "text-green-400" },
              { label: "LLM calls", count: filteredEvents.filter(e => e.toolName === "llm_call").length, color: "text-indigo-400" },
              { label: "Agent events", count: filteredEvents.filter(e => ["AGENT_SPAWN","AGENT_START","AGENT_END","SUBAGENT_SPAWNING","SUBAGENT_ENDED"].includes(e.type)).length, color: "text-purple-400" },
              { label: "Errors", count: filteredEvents.filter(e => e.status === "error" || !!e.error).length, color: "text-red-400" },
            ].map(({ label, count, color }) => count > 0 && (
              <div key={label} className="flex items-center gap-1.5 shrink-0">
                <span className={`text-xs font-bold tabular-nums ${color}`}>{count.toLocaleString()}</span>
                <span className="text-[10px] text-white/20">{label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Events list ──────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {/* Empty state */}
        {displayedEvents.length === 0 && (
          <div className="flex flex-col items-center justify-center h-60 gap-3 px-4">
            <svg className="w-10 h-10 text-white/10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <polyline points="22,12 18,12 15,21 9,3 6,12 2,12" />
            </svg>
            <p className="text-sm text-white/20 text-center">
              {search || typeFilter !== "all" || statusFilter !== "all" || timeFilter !== "all" || sessionSearch
                ? "No events match your filters"
                : "No events yet"}
            </p>
            {(search || typeFilter !== "all" || statusFilter !== "all" || timeFilter !== "all" || sessionSearch) && (
              <button
                onClick={() => {
                  setSearch("");
                  setTypeFilter("all");
                  setStatusFilter("all");
                  setTimeFilter("all");
                  setSessionSearch("");
                }}
                className="text-sm text-blue-400/60 hover:text-blue-400 transition-colors py-2 px-4 min-h-[44px]"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            MOBILE: Card view
            ═══════════════════════════════════════════════════════════ */}
        <div className="sm:hidden p-4 space-y-3">
          {displayedEvents.map((ev) => (
            <MobileEventCard
              key={ev.id}
              event={ev}
              isSelected={selectedId === ev.id}
              onSelect={() => setSelectedId(selectedId === ev.id ? null : ev.id)}
            />
          ))}
        </div>

        {/* ═══════════════════════════════════════════════════════════
            DESKTOP: Table view
            ═══════════════════════════════════════════════════════════ */}
        <div className="hidden sm:block">
          {/* Table header */}
          <div className="sticky top-0 z-10 bg-[#0a0a0f]/95 backdrop-blur-sm border-b border-white/[0.06]">
            <div className="grid grid-cols-[140px_120px_1fr_100px_80px_80px_60px] gap-2 px-4 sm:px-6 py-2 text-[10px] text-white/25 uppercase tracking-wider font-medium">
              <span>Time</span>
              <span>Type</span>
              <span>Tool / Details</span>
              <span>Session</span>
              <span className="text-right">Duration</span>
              <span className="text-right">Tokens</span>
              <span className="text-center">Status</span>
            </div>
          </div>

          {/* Rows */}
          {displayedEvents.map((ev) => {
            const ts = new Date(ev.timestamp);
            const isSelected = selectedId === ev.id;
            const isError = ev.status === "error" || !!ev.error;

            return (
              <div key={ev.id}>
                <div
                  onClick={() => setSelectedId(isSelected ? null : ev.id)}
                  className={`grid grid-cols-[140px_120px_1fr_100px_80px_80px_60px] gap-2 px-4 sm:px-6 py-2.5 text-xs border-b border-white/[0.03] border-l-2 cursor-pointer transition-colors ${
                    isError
                      ? "border-l-red-500/70 bg-red-500/[0.03] hover:bg-red-500/[0.05]"
                      : TYPE_BORDER[ev.type] ?? "border-l-transparent"
                  } ${isSelected ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"}`}
                >
                  {/* Time */}
                  <div className="flex flex-col justify-center min-w-0">
                    <span className="text-white/50 tabular-nums truncate">
                      {format(ts, "HH:mm:ss.SSS")}
                    </span>
                    <span className="text-[10px] text-white/20 truncate">
                      {formatDistanceToNow(ts, { addSuffix: true })}
                    </span>
                  </div>

                  {/* Type badge */}
                  <div className="flex items-center">
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-semibold border truncate ${
                        TYPE_BADGE[ev.type] ?? "bg-white/5 text-white/30 border-white/5"
                      }`}
                    >
                      {ev.type.replace(/_/g, " ")}
                    </span>
                  </div>

                  {/* Tool / details */}
                  <div className="flex flex-col justify-center min-w-0">
                    {ev.toolName ? (
                      <span className="font-semibold text-white/70 truncate">{ev.toolName}</span>
                    ) : (
                      <span className="text-white/25 truncate">{ev.type.toLowerCase().replace(/_/g, " ")}</span>
                    )}
                    {/* Inline input/output preview */}
                    {(() => { const p = getEventPreview(ev); return p ? <EventInlinePreview preview={p} /> : null; })()}
                    {ev.error && (
                      <span className="text-[10px] text-red-400/70 truncate mt-0.5">{ev.error}</span>
                    )}
                    {ev.model && !ev.error && (
                      <span className="text-[10px] text-white/20 font-mono truncate mt-0.5">
                        {ev.model.split("/").pop()}
                      </span>
                    )}
                  </div>

                  {/* Session */}
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="font-mono text-white/35 truncate text-[11px]">
                      {ev.sessionId.slice(0, 8)}
                    </span>
                    <CopyButton text={ev.sessionId} />
                  </div>

                  {/* Duration */}
                  <div className="flex items-center justify-end">
                    {ev.durationMs != null ? (
                      <span className="text-white/40 tabular-nums">
                        {ev.durationMs >= 1000
                          ? `${(ev.durationMs / 1000).toFixed(1)}s`
                          : `${ev.durationMs}ms`}
                      </span>
                    ) : (
                      <span className="text-white/10">-</span>
                    )}
                  </div>

                  {/* Tokens */}
                  <div className="flex items-center justify-end">
                    {ev.inputTokens || ev.outputTokens ? (
                      <span className="font-mono text-white/30 text-[10px] tabular-nums">
                        {(ev.inputTokens ?? 0).toLocaleString()}/{(ev.outputTokens ?? 0).toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-white/10">-</span>
                    )}
                  </div>

                  {/* Status */}
                  <div className="flex items-center justify-center">
                    {isError ? (
                      <span className="w-2 h-2 rounded-full bg-red-400" title="Error" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-emerald-400/70" title="OK" />
                    )}
                  </div>
                </div>

                {/* Expanded detail */}
                {isSelected && <EventDetail event={ev} />}
              </div>
            );
          })}
        </div>

        {/* Load more */}
        {displayedEvents.length > 0 && hasMore && (
          <div className="flex justify-center py-6">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="flex items-center gap-2 px-5 py-3 sm:py-2.5 rounded-xl sm:rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm sm:text-xs font-medium text-white/50 hover:text-white/70 hover:bg-white/[0.08] active:bg-white/[0.1] disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-h-[44px]"
            >
              {loadingMore ? (
                <>
                  <span className="w-4 h-4 sm:w-3.5 sm:h-3.5 border-2 border-white/10 border-t-white/40 rounded-full animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  Load more events
                  <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6,9 12,15 18,9" />
                  </svg>
                </>
              )}
            </button>
          </div>
        )}

        {/* End marker */}
        {displayedEvents.length > 0 && !hasMore && (
          <div className="flex justify-center py-6">
            <span className="text-[10px] text-white/15">End of events</span>
          </div>
        )}
      </div>
    </div>
  );
}


export default function EventsPage() {
  return (
    <Suspense>
      <EventsPageInner />
    </Suspense>
  );
}
