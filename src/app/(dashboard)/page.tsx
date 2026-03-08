"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useDashboard } from "./layout";
import { LiveFeed } from "@/components/LiveFeed";

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

function fmtCost(usd: number): string {
  return usd >= 100 ? `$${Math.round(usd)}` : `$${usd.toFixed(2)}`;
}

function fmtDuration(ms: number): string {
  if (ms < 1000)    return `${ms}ms`;
  if (ms < 60_000)  return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m`;
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

interface KpiProps {
  label: string;
  value: string;
  sub: string;
  accentClass: string; // border-l + text color
  badge?: { text: string; colorClass: string };
  href?: string;
  loading?: boolean;
}

function KpiCard({ label, value, sub, accentClass, badge, href, loading }: KpiProps) {
  const inner = (
    <div
      className={`
        relative flex flex-col gap-1.5 p-4 rounded-xl
        border border-white/[0.07] border-l-2 ${accentClass}
        bg-white/[0.02] hover:bg-white/[0.035] transition-colors
        cursor-${href ? "pointer" : "default"}
      `}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-white/35">
          {label}
        </span>
        {badge && (
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${badge.colorClass}`}>
            {badge.text}
          </span>
        )}
      </div>
      {loading ? (
        <div className="h-8 w-20 rounded-lg bg-white/[0.06] animate-pulse mt-1" />
      ) : (
        <span className="text-2xl sm:text-3xl font-bold tabular-nums text-white/90 leading-none">
          {value}
        </span>
      )}
      <span className="text-[11px] text-white/30">{sub}</span>
    </div>
  );

  return href ? <Link href={href}>{inner}</Link> : inner;
}

// ── Tool Bar ──────────────────────────────────────────────────────────────────

function ToolBar({ name, count, max }: { name: string; count: number; max: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 group">
      <span className="text-[11px] font-mono text-white/40 w-20 truncate shrink-0">{name}</span>
      <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className="h-full bg-white/20 group-hover:bg-white/30 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] font-mono text-white/25 tabular-nums w-10 text-right shrink-0">
        {fmt(count)}
      </span>
    </div>
  );
}

// ── Recent Run Row ────────────────────────────────────────────────────────────

interface RunRow {
  id: string;
  label: string;
  triggerType: string;
  status: "running" | "done" | "error" | "stale";
  durationMs: number;
  startedAt: string;
  totalErrors: number;
}

const TRIG_ICON: Record<string, string> = {
  cron: "⏰", heartbeat: "💓", subagent: "🤖", unknown: "◎",
};

function RunItem({ run }: { run: RunRow }) {
  const isRunning = run.status === "running";
  return (
    <Link
      href={`/sessions/${run.id}`}
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-colors group"
    >
      <span className="text-base shrink-0">{TRIG_ICON[run.triggerType] ?? "◎"}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-medium text-white/70 truncate">{run.label}</div>
        <div className="text-[10px] text-white/25 mt-0.5">
          {isRunning ? (
            <span className="text-yellow-400/70 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse inline-block" />
              running
            </span>
          ) : (
            fmtDuration(run.durationMs)
          )}
        </div>
      </div>
      {run.totalErrors > 0 && (
        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/25 shrink-0">
          {run.totalErrors} err
        </span>
      )}
      {run.status === "done" && run.totalErrors === 0 && (
        <span className="text-[10px] text-emerald-400/50 shrink-0">✓</span>
      )}
      <svg className="w-3 h-3 text-white/10 group-hover:text-white/30 transition-colors shrink-0"
        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="9,18 15,12 9,6" />
      </svg>
    </Link>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const { stats, events, sessions, connState, dbHealthy, lastRefresh } = useDashboard();
  const [runs, setRuns] = useState<RunRow[]>([]);

  // Fetch recent runs for the sidebar
  useEffect(() => {
    fetch("/api/runs?limit=6")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d?.runs && setRuns(d.runs.slice(0, 5)))
      .catch(() => {});
  }, []);

  // Derived stats
  const eventsPerHour = stats ? Math.round(stats.last1h) : null;
  const avgPerHour    = stats ? Math.round(stats.last24h / 24) : null;
  const errorRate     = stats && stats.last24h > 0
    ? ((stats.errorsLast24h / stats.last24h) * 100).toFixed(1)
    : null;
  const cacheHit      = stats?.tokenStats._sum.cacheTokens && stats.tokenStats._sum.inputTokens
    ? Math.round((stats.tokenStats._sum.cacheTokens / (stats.tokenStats._sum.cacheTokens + stats.tokenStats._sum.inputTokens)) * 100)
    : null;

  // System health
  const isHealthy  = dbHealthy && connState === "connected" && (parseFloat(errorRate ?? "0") < 10);
  const isDegraded = !dbHealthy || parseFloat(errorRate ?? "0") >= 10;
  const statusLabel = !dbHealthy ? "DB Issues" : connState !== "open" ? "Disconnected" : isDegraded ? "Degraded" : "Operational";
  const statusColor = isDegraded ? "text-red-400 bg-red-500/10 border-red-500/25"
    : connState !== "open"       ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/25"
    :                              "text-emerald-400 bg-emerald-500/10 border-emerald-500/25";
  const statusDot = isDegraded ? "bg-red-400" : connState !== "open" ? "bg-yellow-400 animate-pulse" : "bg-emerald-400";

  const toolData = stats?.byTool ?? [];
  const maxTool  = toolData[0]
    ? (typeof (toolData[0]._count as any) === "object"
        ? (toolData[0]._count as any).toolName ?? 0
        : (toolData[0]._count as any) ?? 0)
    : 0;

  return (
    <div className="flex flex-col h-full">

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 sm:px-6 py-3.5 border-b border-white/[0.06]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-semibold text-white/90 leading-none">Overview</h1>
            <p className="text-[11px] text-white/25 mt-1">OpenClaw · Real-time agent monitoring</p>
          </div>
          <div className="flex items-center gap-2.5">
            {lastRefresh && (
              <span className="text-[10px] text-white/20 tabular-nums hidden sm:inline font-mono">
                {lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
            <span className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border ${statusColor}`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot}`} />
              {statusLabel}
            </span>
          </div>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex flex-col">

        {/* KPI Row */}
        <div className="shrink-0 grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 px-4 sm:px-6 py-4 border-b border-white/[0.04]">
          <KpiCard
            label="Events / hr"
            value={eventsPerHour !== null ? fmt(eventsPerHour) : "—"}
            sub={avgPerHour !== null ? `${fmt(avgPerHour)}/hr 24h avg` : "loading…"}
            accentClass="border-l-blue-500/60"
            href="/events"
            loading={!stats}
          />
          <KpiCard
            label="Last Hour"
            value={stats ? fmt(stats.last1h) : "—"}
            sub={stats ? `${fmt(stats.last24h)} total today` : "loading…"}
            accentClass="border-l-violet-500/60"
            loading={!stats}
          />
          <KpiCard
            label="Errors 24h"
            value={stats ? fmt(stats.errorsLast24h) : "—"}
            sub={errorRate !== null ? `${errorRate}% error rate` : "loading…"}
            accentClass={stats && stats.errorsLast24h > 50 ? "border-l-red-500/70" : "border-l-orange-500/40"}
            badge={stats && stats.errorsLast24h > 0 ? {
              text: `${errorRate}%`,
              colorClass: parseFloat(errorRate ?? "0") > 5
                ? "bg-red-500/15 text-red-400 border-red-500/25"
                : "bg-orange-500/15 text-orange-400 border-orange-500/25"
            } : undefined}
            href="/events"
            loading={!stats}
          />
          <KpiCard
            label="Cost 24h"
            value={stats ? fmtCost(stats.costUsd24h ?? stats.estimatedCostUsd ?? 0) : "—"}
            sub={cacheHit !== null ? `${cacheHit}% cache hit` : "LLM spend"}
            accentClass="border-l-emerald-500/60"
            loading={!stats}
          />
        </div>

        {/* Main content */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">

          {/* ── Live Feed ─────────────────────────────────────────────── */}
          <div className="flex flex-col flex-1 min-h-0 border-r border-white/[0.04] overflow-hidden">
            <div className="shrink-0 px-4 py-2.5 border-b border-white/[0.04] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-white/50">Live Feed</span>
                <span className={`w-1.5 h-1.5 rounded-full ${connState === "connected" ? "bg-emerald-400 animate-pulse" : "bg-white/20"}`} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-white/20 tabular-nums">{events.length} events</span>
                <Link href="/events" className="text-[10px] text-white/20 hover:text-white/50 transition-colors">
                  view all →
                </Link>
              </div>
            </div>
            <div className="flex-1 min-h-0 lg:h-auto h-[45vh]">
              <LiveFeed externalEvents={events as any} />
            </div>
          </div>

          {/* ── Right Sidebar ─────────────────────────────────────────── */}
          <div className="w-full lg:w-72 xl:w-80 shrink-0 flex flex-col overflow-y-auto">

            {/* Recent Runs */}
            <div className="shrink-0 border-b border-white/[0.04]">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.04]">
                <span className="text-xs font-semibold text-white/50">Recent Runs</span>
                <Link href="/runs" className="text-[10px] text-white/20 hover:text-white/50 transition-colors">
                  view all →
                </Link>
              </div>
              <div className="py-1">
                {runs.length === 0 ? (
                  <div className="px-4 py-4 text-[11px] text-white/20 text-center">No runs yet</div>
                ) : (
                  runs.map((r) => <RunItem key={r.id} run={r} />)
                )}
              </div>
            </div>

            {/* Top Tools */}
            <div className="shrink-0 border-b border-white/[0.04]">
              <div className="px-4 py-2.5 border-b border-white/[0.04]">
                <span className="text-xs font-semibold text-white/50">Top Tools</span>
              </div>
              <div className="px-4 py-3 space-y-2.5">
                {!stats ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="h-2 w-16 bg-white/[0.06] rounded animate-pulse" />
                      <div className="flex-1 h-1.5 bg-white/[0.04] rounded animate-pulse" />
                    </div>
                  ))
                ) : (
                  toolData.slice(0, 8).map((d) => {
                    const count = typeof (d._count as any) === "object"
                      ? (d._count as any).toolName ?? 0
                      : (d._count as any) ?? 0;
                    return (
                      <ToolBar
                        key={d.toolName ?? "unknown"}
                        name={d.toolName ?? "unknown"}
                        count={count}
                        max={maxTool}
                      />
                    );
                  })
                )}
              </div>
            </div>

            {/* Sessions summary */}
            <div className="shrink-0">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.04]">
                <span className="text-xs font-semibold text-white/50">Sessions</span>
                <Link href="/sessions" className="text-[10px] text-white/20 hover:text-white/50 transition-colors">
                  view all →
                </Link>
              </div>
              <div className="px-4 py-3 space-y-1.5">
                {sessions.slice(0, 4).map((s: any) => (
                  <Link
                    key={s.id}
                    href={`/sessions/${s.id}`}
                    className="flex items-center justify-between py-1.5 hover:opacity-80 transition-opacity"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-white/20 shrink-0" />
                      <span className="text-[11px] text-white/50 truncate font-mono">
                        {s.label ?? s.key?.split(":").pop()?.slice(0, 20) ?? s.id.slice(0, 12)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {s.totalErrors > 0 && (
                        <span className="text-[9px] text-red-400/60">{s.totalErrors}e</span>
                      )}
                      <span className="text-[10px] text-white/20 tabular-nums font-mono">
                        {s._count?.events ?? s.totalEvents ?? 0}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
