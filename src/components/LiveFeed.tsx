"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

interface CommandEntry {
  raw:         string;
  operator:    "start" | "&&" | "||" | ";" | "|";
  category:    string;
  subCategory: string;
  icon:        string;
  label:       string;
  details:     Record<string, string>;
  risk:        "low" | "medium" | "high" | "critical";
}

interface ToolAnalysisMeta {
  category:    string;
  subCategory: string;
  icon:        string;
  label:       string;
  details:     Record<string, string>;
  risk:        "low" | "medium" | "high" | "critical";
  hasSecrets:  boolean;
  isCompound:  boolean;
  commands:    CommandEntry[];
  secrets: Array<{
    type: string; label: string; field: string; masked: string; severity: string;
  }>;
}

interface EventMeta {
  cost_usd?:            number | null;
  cache_write_tokens?:  number | null;
  task?:                string | null;
  mode?:                string | null;
  runtime?:             string | null;
  model?:               string | null;
  label?:               string | null;
  toolAnalysis?:        ToolAnalysisMeta | null;
  [key: string]: unknown;
}

const RISK_BADGE: Record<string, string> = {
  low:      "",   // don't show for low — too noisy
  medium:   "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  high:     "bg-orange-500/20 text-orange-300 border-orange-500/30",
  critical: "bg-red-500/20   text-red-300    border-red-500/30",
};

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

// Left-border accent per event type (fast visual scan)
const TYPE_BORDER: Record<string, string> = {
  TOOL_CALL:         "border-l-blue-500/50",
  MESSAGE_SEND:      "border-l-green-500/50",
  MESSAGE_SENT:      "border-l-green-500/50",
  MESSAGE_RECEIVED:  "border-l-sky-500/50",
  AGENT_SPAWN:       "border-l-purple-500/60",
  AGENT_START:       "border-l-violet-500/50",
  AGENT_END:         "border-l-violet-500/30",
  SUBAGENT_SPAWNING: "border-l-purple-400/40",
  SUBAGENT_ENDED:    "border-l-purple-400/30",
  CRON_RUN:          "border-l-yellow-500/50",
  ERROR:             "border-l-red-500/70",
  SESSION_START:     "border-l-emerald-500/50",
  SESSION_END:       "border-l-gray-500/30",
  MODEL_SWITCH:      "border-l-cyan-500/40",
  LLM_OUTPUT:        "border-l-violet-500/50",
};

// Type → display icon for non-tool events
const TYPE_ICONS: Record<string, string> = {
  MESSAGE_RECEIVED: "📨",
  MESSAGE_SENT:     "📤",
  MESSAGE_SEND:     "📤",
  AGENT_START:      "🚀",
  AGENT_END:        "🏁",
  SUBAGENT_SPAWNING:"🌱",
  SUBAGENT_ENDED:   "🌿",
  SESSION_START:    "▶️",
  SESSION_END:      "⏹️",
  CRON_RUN:         "⏰",
  ERROR:            "🔴",
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

// Safe cast helpers for EventMeta fields (typed as unknown)
const ms = (v: unknown): string => v != null ? String(v) : "";
const mn = (v: unknown): number => typeof v === "number" ? v : Number(v ?? 0);
const mb = (v: unknown): boolean => Boolean(v);

// ── Inline preview helpers ────────────────────────────────────────────────────

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
function getEventPreview(ev: Event): string | null {
  const { type, toolName, input, output, error, metadata: meta } = ev;

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
    const errMsg = error || ms((meta as Record<string, unknown>)?.error ?? "");
    if (errMsg) return "🔴 " + truncStr(errMsg, 80);
    return null;
  }

  return null;
}

/** Inline preview row with optional expand for long previews. */
function EventInlinePreview({ preview }: { preview: string }) {
  const [expanded, setExpanded] = useState(false);
  const SHORT_LEN = 120;
  const isLong = preview.length > SHORT_LEN;
  const displayed = !expanded && isLong ? truncStr(preview, SHORT_LEN) : preview;

  return (
    <p className="text-xs text-muted-foreground mt-0.5 font-mono leading-snug break-all">
      <span className="sm:hidden">{isLong && !expanded ? truncStr(preview, 60) : displayed}</span>
      <span className="hidden sm:inline">{displayed}</span>
      {isLong && (
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          className="ml-1.5 text-[9px] text-blue-400/60 hover:text-blue-300 transition-colors align-middle"
        >
          {expanded ? "▲ less" : "▼ more"}
        </button>
      )}
    </p>
  );
}

function EventDetail({ event }: { event: Event }) {
  const meta = event.metadata;
  const isLlm             = event.toolName === "llm_call";
  const isSpawn           = event.type === "AGENT_SPAWN";
  const isMessageReceived = event.type === "MESSAGE_RECEIVED";
  const isCronRun         = event.type === "CRON_RUN";
  const isMessageSent     = event.type === "MESSAGE_SENT" || event.type === "MESSAGE_SEND";
  const isAgentStart      = event.type === "AGENT_START";
  const isSubagentEnd     = event.type === "SUBAGENT_ENDED";

  return (
    <div
      className="px-3 py-3 bg-white/[0.02] border-b border-white/[0.03] ml-10"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Metadata row */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-white/30 font-mono mb-2">
        <span>
          <span className="text-white/15">Session </span>
          <Link
            href={`/sessions/${event.sessionId}`}
            className="hover:text-blue-400/70 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {event.sessionId}
          </Link>
        </span>
        <span><span className="text-white/15">Time </span>{new Date(event.timestamp).toISOString()}</span>
        {event.durationMs != null && (
          <span><span className="text-white/15">Duration </span>{event.durationMs}ms</span>
        )}
        {event.subAgentId && (
          <span><span className="text-white/15">Sub-agent </span>{event.subAgentId}</span>
        )}
      </div>

      {/* ── Cron Run ── */}
      {isCronRun && meta && (
        <div className="mb-2 p-2.5 bg-yellow-500/5 border border-yellow-500/10 rounded-md space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-yellow-400/80 text-xs font-semibold">⏰ Cron Job</span>
            {ms(meta.trigger) && (
              <span className="text-[10px] text-yellow-300/40 bg-yellow-500/10 px-1.5 py-0.5 rounded font-mono">
                trigger: {ms(meta.trigger)}
              </span>
            )}
          </div>
          {ms(meta.prompt_preview) && (
            <div className="p-2 bg-black/20 rounded text-[11px] text-white/50 italic leading-relaxed">
              &ldquo;{ms(meta.prompt_preview)}&rdquo;
            </div>
          )}
        </div>
      )}

      {/* ── Message Received ── */}
      {isMessageReceived && meta && (
        <div className="mb-2 p-2.5 bg-sky-500/5 border border-sky-500/10 rounded-md space-y-1">
          {ms(meta.sender_name)  && <div className="text-[11px] text-sky-200/80">👤 {ms(meta.sender_name)}</div>}
          {ms(meta.channel)      && <div className="text-[11px] text-sky-200/40 font-mono">📡 {ms(meta.channel)}{meta.provider ? ` (${meta.provider})` : ""}</div>}
          {ms(meta.content_preview) && (
            <div className="mt-1.5 p-2 bg-black/20 rounded text-[11px] text-white/50 italic">
              &ldquo;{ms(meta.content_preview)}&rdquo;
            </div>
          )}
          <div className="text-[10px] text-white/20 font-mono">
            {meta.content_length != null && `${meta.content_length} chars`}
            {mb(meta.is_group) && " · group"}
          </div>
        </div>
      )}

      {/* ── Message Sent ── */}
      {isMessageSent && meta && (
        <div className="mb-2 p-2.5 bg-green-500/5 border border-green-500/10 rounded-md space-y-1">
          {ms(meta.channel) && <div className="text-[11px] text-green-200/40 font-mono">📡 {ms(meta.channel)}</div>}
          {meta.response_time_ms != null && (
            <div className="text-[11px] text-green-300/60">⏱ Response time: <span className="font-semibold">{mn(meta.response_time_ms)}ms</span></div>
          )}
          {ms(meta.content_preview) && (
            <div className="mt-1.5 p-2 bg-black/20 rounded text-[11px] text-white/50 italic">
              &ldquo;{ms(meta.content_preview)}&rdquo;
            </div>
          )}
          {meta.content_length != null && (
            <div className="text-[10px] text-white/20 font-mono">{mn(meta.content_length)} chars</div>
          )}
        </div>
      )}

      {/* ── Agent Start ── */}
      {isAgentStart && meta && (
        <div className="mb-2 p-2.5 bg-violet-500/5 border border-violet-500/10 rounded-md space-y-1">
          {ms(meta.prompt_preview) && (
            <div className="p-2 bg-black/20 rounded text-[11px] text-white/50 italic">
              &ldquo;{ms(meta.prompt_preview)}&rdquo;
            </div>
          )}
          <div className="flex gap-3 text-[10px] text-violet-300/40 font-mono">
            {meta.prompt_length  != null && <span>prompt: {mn(meta.prompt_length)} chars</span>}
            {meta.messages_count != null && <span>history: {mn(meta.messages_count)} msgs</span>}
          </div>
        </div>
      )}

      {/* ── Subagent Ended ── */}
      {isSubagentEnd && meta && (
        <div className="mb-2 p-2.5 bg-purple-500/5 border border-purple-500/10 rounded-md space-y-1">
          {ms(meta.target_session_key) && <div className="text-[11px] text-purple-200/60 font-mono">{ms(meta.target_session_key)}</div>}
          {ms(meta.outcome) && (
            <div className={`text-[11px] font-semibold ${ms(meta.outcome) === "ok" ? "text-green-400/70" : "text-red-400/70"}`}>
              {ms(meta.outcome) === "ok" ? "✅" : "❌"} {ms(meta.outcome)}
            </div>
          )}
          {ms(meta.reason) && <div className="text-[11px] text-white/30">Reason: {ms(meta.reason)}</div>}
        </div>
      )}

      {/* ── Agent Spawn task ── */}
      {isSpawn && meta?.task && (
        <div className="mb-2 p-2.5 bg-purple-500/5 border border-purple-500/10 rounded-md">
          <div className="text-[10px] font-semibold text-purple-300/60 uppercase tracking-wider mb-1">Task</div>
          <p className="text-[11px] text-purple-100/70 leading-relaxed whitespace-pre-wrap break-words">{ms(meta.task)}</p>
          <div className="flex gap-3 mt-2 text-[10px] text-purple-300/40 font-mono">
            {ms(meta.mode)    && <span>mode: {meta.mode}</span>}
            {ms(meta.runtime) && <span>runtime: {meta.runtime}</span>}
            {ms(meta.model)   && <span>model: {ms(meta.model).split("/").pop()}</span>}
            {ms(meta.label)   && <span>label: {meta.label}</span>}
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

      {/* ── Tool Analysis (TOOL_CALL only) ── */}
      {event.type === "TOOL_CALL" && meta?.toolAnalysis && (() => {
        const a = meta.toolAnalysis as ToolAnalysisMeta;
        return (
          <div className="mb-2 p-2.5 bg-blue-500/5 border border-blue-500/10 rounded-md space-y-2">
            {/* Header row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base">{a.icon}</span>
              <span className="text-[11px] font-semibold text-blue-200/80">{a.label}</span>
              <span className="text-[9px] font-mono text-white/25">{a.subCategory}</span>
              {a.risk !== "low" && (
                <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border ${RISK_BADGE[a.risk] ?? ""}`}>
                  {a.risk}
                </span>
              )}
            </div>

            {/* Details (headline command) */}
            {Object.keys(a.details ?? {}).length > 0 && !a.isCompound && (
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] font-mono">
                {Object.entries(a.details).map(([k, v]) => (
                  <span key={k} className="text-white/30">
                    <span className="text-white/15">{k}: </span>{v}
                  </span>
                ))}
              </div>
            )}

            {/* Compound commands list */}
            {a.isCompound && a.commands && a.commands.length > 0 && (
              <div className="space-y-1">
                {a.commands.map((c, i) => (
                  <div key={i} className="flex items-start gap-2 text-[10px]">
                    {/* Operator badge */}
                    <span className={`shrink-0 px-1 py-0.5 rounded font-mono font-bold text-[9px] border ${
                      c.operator === "start" ? "bg-white/5  text-white/30 border-white/10" :
                      c.operator === "&&"    ? "bg-green-500/15 text-green-300 border-green-500/20" :
                      c.operator === "||"    ? "bg-orange-500/15 text-orange-300 border-orange-500/20" :
                      c.operator === "|"     ? "bg-blue-500/15 text-blue-300 border-blue-500/20" :
                                               "bg-white/5 text-white/30 border-white/10"
                    }`}>
                      {c.operator === "start" ? "#1" : c.operator}
                    </span>
                    {/* Icon + label */}
                    <span className="shrink-0">{c.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-white/75 font-mono">{c.label}</span>
                        {c.risk !== "low" && (
                          <span className={`px-1 py-0.5 rounded text-[8px] font-bold uppercase border ${
                            c.risk === "critical" ? "bg-red-500/20 text-red-300 border-red-500/30" :
                            c.risk === "high"     ? "bg-orange-500/20 text-orange-300 border-orange-500/30" :
                                                    "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"
                          }`}>{c.risk}</span>
                        )}
                      </div>
                      {/* Raw command */}
                      <div className="text-[9px] text-white/20 font-mono truncate mt-0.5">{c.raw}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Secrets */}
            {a.secrets && a.secrets.length > 0 && (
              <div className="mt-1 p-2 bg-red-600/10 border border-red-500/25 rounded space-y-1.5">
                <div className="text-[9px] font-bold text-red-300/90 uppercase tracking-widest mb-1">
                  ⚠️ Potential secrets detected
                </div>
                {a.secrets.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px]">
                    <span className={`px-1.5 py-0.5 rounded border text-[8px] font-bold uppercase ${
                      s.severity === "critical" ? "bg-red-500/20 text-red-300 border-red-500/30" :
                      s.severity === "high"     ? "bg-orange-500/20 text-orange-300 border-orange-500/30" :
                                                  "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"
                    }`}>
                      {s.severity}
                    </span>
                    <span className="text-white/60">{s.label}</span>
                    <span className="font-mono text-white/30">{s.masked}</span>
                    <span className="text-white/20">in {s.field}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      <JsonBlock data={event.input}  label="Input (params)"  />
      <JsonBlock data={event.output} label="Output (result)" />

      {/* Generic metadata for other types */}
      {meta && !isSpawn && !isLlm && !isMessageReceived && !isMessageSent && !isAgentStart && !isSubagentEnd && !isCronRun &&
        Object.keys(meta).filter(k => k !== "toolAnalysis").some(k => meta[k] != null) && (
        <JsonBlock data={Object.fromEntries(Object.entries(meta).filter(([k]) => k !== "toolAnalysis"))} label="Metadata" />
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
  externalEvents,
  onConnectionChange,
}: {
  initialEvents?: Event[];
  externalEvents?: Event[];
  onConnectionChange?: (connected: boolean) => void;
}) {
  const [ownEvents,       setOwnEvents]       = useState<Event[]>(initialEvents);
  const [connected,       setConnected]       = useState(false);
  const [filter,          setFilter]          = useState<string>("all");
  const [newCount,        setNewCount]        = useState(0);
  const [expandedId,      setExpandedId]      = useState<string | null>(null);
  const [atTop,           setAtTop]           = useState(true);
  const [pendingCount,    setPendingCount]    = useState(0);
  const [isPaused,        setIsPaused]        = useState(false);
  const [isPinnedPaused,  setIsPinnedPaused]  = useState(false);
  const [displayedEvents, setDisplayedEvents] = useState<Event[]>(initialEvents);
  const [bufferedCount,   setBufferedCount]   = useState(0);
  const topRef               = useRef<HTMLDivElement>(null);
  const atTopRef             = useRef(true);
  const prevFilteredLenRef   = useRef(0);
  const justChangedFilterRef = useRef(false);
  const prevEventsLenRef     = useRef(initialEvents.length);

  // Use external events if provided (from dashboard layout context), otherwise manage own SSE
  const events = externalEvents ?? ownEvents;

  // Derived: effective pause = hover-pause OR pinned-pause
  const effectivePaused = isPaused || isPinnedPaused;

  const setConn = useCallback((v: boolean) => {
    setConnected(v);
    onConnectionChange?.(v);
  }, [onConnectionChange]);

  // Only run own SSE if no external events are provided
  useEffect(() => {
    if (externalEvents) return;
    const es = new EventSource("/api/live");
    es.onopen    = () => setConn(true);
    es.onerror   = () => setConn(false);
    es.onmessage = (e) => {
      const event: Event = JSON.parse(e.data);
      setOwnEvents((prev) => [event, ...prev].slice(0, 500));
      setNewCount((n) => n + 1);
    };
    return () => es.close();
  }, [setConn, externalEvents]);

  // Detect whether user is at the top of the feed (within 200 px)
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const isAtTop = e.currentTarget.scrollTop <= 200;
    atTopRef.current = isAtTop;
    setAtTop(isAtTop);
  }, []);

  // When filter changes: reset pending banner, scroll to top, set guard flag
  useEffect(() => {
    setPendingCount(0);
    atTopRef.current = true;
    setAtTop(true);
    topRef.current?.scrollTo({ top: 0 });
    justChangedFilterRef.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  // Sync displayed events with live events when not paused; count buffered when paused
  useEffect(() => {
    if (!effectivePaused) {
      setDisplayedEvents(events);
      setBufferedCount(0);
      prevEventsLenRef.current = events.length;
    } else {
      const added = events.length - prevEventsLenRef.current;
      if (added > 0) {
        setBufferedCount((c) => c + added);
        prevEventsLenRef.current = events.length;
      }
    }
  }, [events, effectivePaused]);

  // Auto-scroll to top on new events — only when not paused and user is already at top
  useEffect(() => {
    if (effectivePaused) return;
    if (atTopRef.current) {
      topRef.current?.scrollTo({ top: 0 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.length]);

  const filtered = filter === "all"      ? displayedEvents
    : filter === "errors"    ? displayedEvents.filter(e => e.status === "error" || !!e.error)
    : filter === "tools"     ? displayedEvents.filter(e => e.type === "TOOL_CALL" && e.toolName !== "llm_call")
    : filter === "agents"    ? displayedEvents.filter(e => ["AGENT_SPAWN","AGENT_START","AGENT_END","SUBAGENT_SPAWNING","SUBAGENT_ENDED"].includes(e.type))
    : filter === "llm"       ? displayedEvents.filter(e => e.toolName === "llm_call")
    : filter === "messages"  ? displayedEvents.filter(e => ["MESSAGE_RECEIVED","MESSAGE_SENT","MESSAGE_SEND"].includes(e.type))
    : filter === "crons"     ? displayedEvents.filter(e => e.type === "CRON_RUN")
    : filter === "sessions"  ? displayedEvents.filter(e => ["SESSION_START","SESSION_END"].includes(e.type))
    : displayedEvents;

  const filters = [
    { id: "all",      label: "All" },
    { id: "tools",    label: "⚡ Tools" },
    { id: "agents",   label: "🤖 Agents" },
    { id: "llm",      label: "✨ LLM" },
    { id: "crons",    label: "⏰ Crons" },
    { id: "messages", label: "📨 Messages" },
    { id: "sessions", label: "▶️ Sessions" },
    { id: "errors",   label: "🔴 Errors" },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Filter tabs - mobile-optimized with touch targets */}
      <div className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 sm:py-2.5 border-b border-white/5 overflow-x-auto scrollbar-none">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => { setFilter(f.id); setNewCount(0); }}
            className={`shrink-0 px-2.5 sm:px-3 py-2 sm:py-1 rounded-lg text-[11px] sm:text-xs font-medium transition-colors min-h-[36px] sm:min-h-0 ${
              filter === f.id
                ? "bg-white/10 text-white"
                : "text-white/30 active:text-white/60 sm:hover:text-white/60"
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
        <div className="ml-auto shrink-0 flex items-center gap-2">
          <span className="text-[10px] text-white/20 hidden sm:block">{displayedEvents.length} events</span>
          {/* Pause / Resume toggle button — always visible, 44px touch target */}
          <button
            onClick={() => setIsPinnedPaused((p) => !p)}
            aria-label={isPinnedPaused ? "Resume live feed" : "Pause live feed"}
            title={isPinnedPaused ? "Resume" : "Pause"}
            className={`flex items-center justify-center min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] rounded-lg text-sm transition-colors ${
              isPinnedPaused
                ? "bg-white/10 text-white"
                : "text-white/30 hover:text-white/60 active:text-white/60"
            }`}
          >
            {isPinnedPaused ? "▶" : "⏸"}
          </button>
        </div>
      </div>

      {/* Events */}
      <div
        ref={topRef}
        className="flex-1 overflow-y-auto relative"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onScroll={handleScroll}
      >
        {/* Paused badge — top-right corner, sticky */}
        {effectivePaused && (
          <div className="sticky top-2 z-10 flex justify-end px-2 pointer-events-none">
            <span className="text-[10px] text-white/40 bg-white/[0.04] rounded-full px-2 py-0.5">
              ⏸ Paused{bufferedCount > 0 ? ` · +${bufferedCount} new` : ""}
            </span>
          </div>
        )}

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <span className="text-3xl opacity-20">👁</span>
            <p className="text-xs text-white/20">Waiting for events…</p>
          </div>
        )}

        {filtered.map((ev) => {
          const isLlm      = ev.toolName === "llm_call";
          const isSpawn    = ev.type === "AGENT_SPAWN";
          const meta       = ev.metadata;
          const badgeCls   = isLlm ? LLM_BADGE : (TYPE_BADGE[ev.type] ?? "bg-white/5 text-white/30 border-white/5");
          const badgeLabel = isLlm ? "LLM CALL" : ev.type.replace(/_/g, " ");
          const hasDetail  = ev.input != null || ev.output != null || isSpawn || isLlm;
          const preview    = getEventPreview(ev);

          return (
            <div key={ev.id}>
              <div
                onClick={() => setExpandedId(expandedId === ev.id ? null : ev.id)}
                className={`flex items-start gap-3 px-3 py-2.5 border-b border-white/[0.03] border-l-2 transition-colors cursor-pointer hover:bg-white/[0.03] ${
                  expandedId === ev.id ? "bg-white/[0.04]" : ""
                } ${
                  ev.status === "error" || ev.error
                    ? "border-l-red-500/70 bg-red-500/[0.02]"
                    : TYPE_BORDER[ev.type] ?? "border-l-transparent"
                }`}
              >
                {/* Icon — use analysis icon for exec tool calls */}
                {(() => {
                  const analysis = (ev.metadata as EventMeta | null)?.toolAnalysis;
                  const icon = (ev.type === "TOOL_CALL" && analysis?.icon)
                    ? analysis.icon
                    : (TOOL_ICONS[ev.toolName ?? ""] ?? TYPE_ICONS[ev.type] ?? "📌");
                  return (
                    <span className="text-lg shrink-0 w-7 text-center mt-0.5">{icon}</span>
                  );
                })()}

                {/* Content */}
                {(() => {
                  const analysis = (ev.metadata as EventMeta | null)?.toolAnalysis;
                  const riskBadge = analysis && RISK_BADGE[analysis.risk];
                  const analysisLabel = ev.type === "TOOL_CALL" && analysis ? analysis.label : null;
                  return (
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-semibold border ${badgeCls}`}>
                      {badgeLabel}
                    </span>

                    {/* Tool name — replaced by analysis label when available */}
                    {ev.toolName && !isLlm && !analysisLabel && (
                      <span className="text-xs font-semibold text-white/80">{ev.toolName}</span>
                    )}
                    {analysisLabel && (
                      <span className="text-xs font-semibold text-white/85 font-mono">{analysisLabel}</span>
                    )}

                    {/* Risk badge (only medium+) */}
                    {riskBadge && (
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wide border ${riskBadge}`}>
                        {analysis!.risk}
                      </span>
                    )}

                    {/* Secrets warning */}
                    {analysis?.hasSecrets && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-bold border bg-red-600/25 text-red-300 border-red-500/40 animate-pulse">
                        🔑 SECRET
                      </span>
                    )}

                    {/* For agent spawn: show label or task snippet */}
                    {isSpawn && (
                      <span className="text-[10px] text-purple-200/60 truncate max-w-[180px]">
                        {ms(meta?.label ?? "") || (meta?.task ? (ms(meta.task)).slice(0, 60) + "…" : "")}
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

                  {/* Inline preview */}
                  {preview && <EventInlinePreview preview={preview} />}

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

                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-white/15 font-mono">
                    <Link
                      href={`/sessions/${ev.sessionId}`}
                      className="font-mono text-white/35 hover:text-blue-400/70 transition-colors truncate text-[11px] tabular-nums min-h-[44px] flex items-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {ev.sessionId.slice(0, 8)}…
                    </Link>
                    <span className="text-white/10">·</span>
                    <span className="tabular-nums">
                      {new Date(ev.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                    <span className="text-white/10">·</span>
                    <span>{formatDistanceToNow(new Date(ev.timestamp), { addSuffix: true })}</span>
                  </div>
                </div>
                  );
                })()}
              </div>

              {expandedId === ev.id && <EventDetail event={ev} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
