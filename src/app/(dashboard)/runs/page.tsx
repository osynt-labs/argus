"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { formatDistanceToNow, format, formatDuration, intervalToDuration } from "date-fns";
import type { RunRow, RunStatus, RunTrigger } from "@/app/api/runs/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const d = intervalToDuration({ start: 0, end: ms });
  if ((d.hours ?? 0) > 0) return `${d.hours}h ${d.minutes}m`;
  if ((d.minutes ?? 0) > 0) return `${d.minutes}m ${d.seconds}s`;
  return `${d.seconds}s`;
}

function jobLabel(run: RunRow): string {
  if (run.label) return run.label;
  if (run.jobName) {
    // Trim long preview text
    const j = run.jobName.length > 60 ? run.jobName.slice(0, 57) + "…" : run.jobName;
    return j;
  }
  if (run.sessionKey) {
    // Extract meaningful part from session key like "openclaw:main:cron:abc123:1741..."
    const parts = run.sessionKey.split(":");
    const cronIdx = parts.indexOf("cron");
    if (cronIdx >= 0 && parts[cronIdx + 1]) return `cron/${parts[cronIdx + 1].slice(0, 8)}`;
    return run.sessionKey.slice(-16);
  }
  return run.id.slice(0, 8);
}

// ── Status chip ───────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<RunStatus, { label: string; dot: string; text: string; bg: string }> = {
  running: {
    label: "פועל",
    dot: "bg-yellow-400 animate-pulse",
    text: "text-yellow-300",
    bg: "bg-yellow-500/10 border-yellow-500/25",
  },
  done: {
    label: "הסתיים",
    dot: "bg-emerald-400",
    text: "text-emerald-300",
    bg: "bg-emerald-500/10 border-emerald-500/25",
  },
  error: {
    label: "שגיאה",
    dot: "bg-red-400",
    text: "text-red-300",
    bg: "bg-red-500/10 border-red-500/25",
  },
  stale: {
    label: "תקוע?",
    dot: "bg-zinc-500",
    text: "text-zinc-400",
    bg: "bg-zinc-500/10 border-zinc-500/25",
  },
};

function StatusChip({ status }: { status: RunStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cfg.bg} ${cfg.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ── Trigger badge ─────────────────────────────────────────────────────────────

const TRIGGER_CONFIG: Record<RunTrigger | "unknown", { icon: string; label: string; color: string }> = {
  cron:     { icon: "⏰", label: "Cron",      color: "text-yellow-400/70" },
  subagent: { icon: "🤖", label: "Sub-agent", color: "text-purple-400/70" },
  unknown:  { icon: "❓", label: "Unknown",   color: "text-white/30" },
};

// ── Run Row ───────────────────────────────────────────────────────────────────

function RunRowItem({ run, isNew }: { run: RunRow; isNew?: boolean }) {
  const trig = TRIGGER_CONFIG[run.triggerType] ?? TRIGGER_CONFIG.unknown;
  const isRunning = run.status === "running";

  // Live duration counter for running jobs
  const [liveDuration, setLiveDuration] = useState<number>(run.durationMs ?? 0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isRunning) return;
    const startMs = new Date(run.startedAt).getTime();
    intervalRef.current = setInterval(() => {
      setLiveDuration(Date.now() - startMs);
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, run.startedAt]);

  return (
    <Link
      href={`/sessions/${run.id}`}
      className={`
        group flex items-center gap-3 sm:gap-4 px-4 py-3.5
        border-b border-white/[0.05] last:border-b-0
        hover:bg-white/[0.03] transition-colors
        ${isNew ? "animate-[fadeIn_0.4s_ease]" : ""}
      `}
    >
      {/* Trigger icon */}
      <span className={`text-xl shrink-0 ${trig.color}`} title={trig.label}>
        {trig.icon}
      </span>

      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-sm font-medium text-white/80 truncate">
            {jobLabel(run)}
          </span>
          <StatusChip status={run.status} />
        </div>

        <div className="flex items-center gap-3 text-[11px] text-white/30 flex-wrap">
          {/* Trigger type */}
          <span>{trig.label}</span>

          {/* Event count */}
          <span>{run.totalEvents} events</span>

          {/* Error count */}
          {run.totalErrors > 0 && (
            <span className="text-red-400/60">
              {run.totalErrors} error{run.totalErrors > 1 ? "s" : ""}
            </span>
          )}

          {/* Parent session link */}
          {run.parentSessionId && (
            <Link
              href={`/sessions/${run.parentSessionId}`}
              className="text-purple-400/50 hover:text-purple-300 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              ← parent
            </Link>
          )}
        </div>
      </div>

      {/* Duration */}
      <div className="shrink-0 text-right">
        <div className={`text-sm font-mono tabular-nums ${isRunning ? "text-yellow-300/70" : "text-white/40"}`}>
          {isRunning ? (
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3 animate-spin opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 11-6.219-8.56" />
              </svg>
              {fmtDuration(liveDuration)}
            </span>
          ) : (
            fmtDuration(run.durationMs ?? 0)
          )}
        </div>
        <div className="text-[10px] text-white/20 font-mono mt-0.5">
          {formatDistanceToNow(new Date(run.startedAt), { addSuffix: true })}
        </div>
      </div>

      {/* Arrow */}
      <svg
        className="w-4 h-4 text-white/15 group-hover:text-white/40 transition-colors shrink-0"
        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      >
        <polyline points="15,18 9,12 15,6" />
      </svg>
    </Link>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type FilterTrigger = "all" | RunTrigger;
type FilterStatus  = "all" | RunStatus;

export default function RunsPage() {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  // Filters
  const [triggerFilter, setTriggerFilter] = useState<FilterTrigger>("all");
  const [statusFilter, setStatusFilter]   = useState<FilterStatus>("all");

  const prevIdsRef = useRef<Set<string>>(new Set());

  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch("/api/runs?limit=200");
      if (!res.ok) return;
      const data = await res.json();
      const incoming: RunRow[] = data.runs ?? [];

      // Detect new runs for flash animation
      const incomingIds = new Set(incoming.map((r) => r.id));
      const added = new Set([...incomingIds].filter((id) => !prevIdsRef.current.has(id)));
      if (added.size > 0) {
        setNewIds(added);
        setTimeout(() => setNewIds(new Set()), 2000);
      }
      prevIdsRef.current = incomingIds;

      setRuns(incoming);
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + 30s polling
  useEffect(() => {
    fetchRuns();
    const interval = setInterval(fetchRuns, 30_000);
    return () => clearInterval(interval);
  }, [fetchRuns]);

  // Filter
  const filtered = runs.filter((r) => {
    if (triggerFilter !== "all" && r.triggerType !== triggerFilter) return false;
    if (statusFilter  !== "all" && r.status        !== statusFilter)  return false;
    return true;
  });

  // Counts for filter tabs
  const countByTrigger = (t: RunTrigger) => runs.filter((r) => r.triggerType === t).length;
  const countByStatus  = (s: RunStatus)  => runs.filter((r) => r.status === s).length;
  const runningCount = countByStatus("running");

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-white/[0.06]">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <h1 className="text-lg font-bold text-white/90 flex items-center gap-2">
              Runs
              {runningCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-yellow-500/15 text-yellow-300 border border-yellow-500/25">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                  {runningCount} פועלים
                </span>
              )}
            </h1>
            <p className="text-xs text-white/35 mt-0.5">
              כל isolated run — cron jobs ו-sub-agents
            </p>
          </div>

          <div className="flex items-center gap-2">
            {lastRefresh && (
              <span className="text-[10px] text-white/20 font-mono hidden sm:block">
                עודכן {format(lastRefresh, "HH:mm:ss")}
              </span>
            )}
            <button
              onClick={fetchRuns}
              className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.05] transition-colors"
              title="רענן"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="23,4 23,10 17,10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </button>
          </div>
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap gap-2">
          {/* Trigger */}
          <div className="flex gap-1 rounded-lg bg-white/[0.04] p-0.5">
            {(["all", "cron", "subagent"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTriggerFilter(t)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  triggerFilter === t
                    ? "bg-white/10 text-white/80"
                    : "text-white/35 hover:text-white/55"
                }`}
              >
                {t === "all"
                  ? `הכל (${runs.length})`
                  : t === "cron"
                  ? `⏰ Cron (${countByTrigger("cron")})`
                  : `🤖 Sub-agent (${countByTrigger("subagent")})`}
              </button>
            ))}
          </div>

          {/* Status */}
          <div className="flex gap-1 rounded-lg bg-white/[0.04] p-0.5">
            {(["all", "running", "done", "error", "stale"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  statusFilter === s
                    ? "bg-white/10 text-white/80"
                    : "text-white/35 hover:text-white/55"
                }`}
              >
                {s === "all"
                  ? "כל הסטטוסים"
                  : s === "running"
                  ? `🟡 פועל (${countByStatus("running")})`
                  : s === "done"
                  ? `✅ הסתיים (${countByStatus("done")})`
                  : s === "error"
                  ? `❌ שגיאה (${countByStatus("error")})`
                  : `⚫ תקוע (${countByStatus("stale")})`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center h-40 text-sm text-white/30 animate-pulse">
            טוען runs…
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-white/25">
            <span className="text-3xl">📭</span>
            <span className="text-sm">אין runs עדיין</span>
            <span className="text-[11px] text-white/15">
              Runs יופיעו לאחר ריצת cron job או sub-agent
            </span>
          </div>
        )}

        {/* Grouped by date */}
        {!loading && filtered.length > 0 && (
          <GroupedRuns runs={filtered} newIds={newIds} />
        )}
      </div>
    </div>
  );
}

// ── Grouped by date ───────────────────────────────────────────────────────────

function GroupedRuns({ runs, newIds }: { runs: RunRow[]; newIds: Set<string> }) {
  // Group by date (today / yesterday / DD.MM.YYYY)
  const groups: { label: string; runs: RunRow[] }[] = [];
  const seen = new Map<string, RunRow[]>();

  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400_000).toDateString();

  for (const run of runs) {
    const d = new Date(run.startedAt);
    const ds = d.toDateString();
    const label =
      ds === today
        ? "היום"
        : ds === yesterday
        ? "אתמול"
        : format(d, "dd.MM.yyyy");

    if (!seen.has(label)) {
      seen.set(label, []);
      groups.push({ label, runs: seen.get(label)! });
    }
    seen.get(label)!.push(run);
  }

  return (
    <>
      {groups.map(({ label, runs: groupRuns }) => (
        <div key={label}>
          {/* Date separator */}
          <div className="sticky top-0 z-10 px-4 py-1.5 bg-[#0d0d0d]/80 backdrop-blur-sm border-b border-white/[0.04]">
            <span className="text-[10px] font-semibold text-white/25 uppercase tracking-wider">
              {label}
            </span>
          </div>

          {/* Run rows */}
          <div className="divide-y divide-white/[0.04]">
            {groupRuns.map((run) => (
              <RunRowItem key={run.id} run={run} isNew={newIds.has(run.id)} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
