"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { formatDistanceToNow, intervalToDuration } from "date-fns";
import { useDashboard, type DashboardSession } from "../layout";
import { detectSessionType, SESSION_TYPE_CONFIG } from "@/lib/session-types";

type SortKey = "lastActive" | "mostEvents" | "mostErrors" | "mostExpensive";

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
  if (!parts.length) parts.push(`${dur.seconds ?? 0}s`);
  return parts.join(" ");
}

function isActiveSession(lastSeenAt: string): boolean {
  return Date.now() - new Date(lastSeenAt).getTime() < 3 * 60 * 1000;
}

function formatTokens(n?: number): string {
  if (n == null || n === 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatCost(n?: number | null): string {
  if (n == null || n === 0) return "—";
  if (n < 0.001) return `$${(n * 1000).toFixed(3)}m`;
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export default function SessionsPage() {
  const { sessions: contextSessions } = useDashboard();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("lastActive");
  const [extraSessions, setExtraSessions] = useState<DashboardSession[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(contextSessions.length >= 10);

  // Merge context sessions with any extra loaded via pagination
  const allSessions = useMemo(() => {
    const seen = new Set(contextSessions.map((s) => s.id));
    const merged = [...contextSessions];
    for (const s of extraSessions) {
      if (!seen.has(s.id)) {
        merged.push(s);
        seen.add(s.id);
      }
    }
    return merged;
  }, [contextSessions, extraSessions]);

  // Filter
  const filtered = useMemo(() => {
    if (!search.trim()) return allSessions;
    const q = search.toLowerCase();
    return allSessions.filter(
      (s) =>
        s.id.toLowerCase().includes(q) ||
        s.key?.toLowerCase().includes(q) ||
        s.agentId?.toLowerCase().includes(q) ||
        s.model?.toLowerCase().includes(q) ||
        s.label?.toLowerCase().includes(q),
    );
  }, [allSessions, search]);

  // Sort
  const sorted = useMemo(() => {
    const copy = [...filtered];
    switch (sortKey) {
      case "lastActive":
        return copy.sort(
          (a, b) =>
            new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime(),
        );
      case "mostEvents":
        return copy.sort((a, b) => b.totalEvents - a.totalEvents);
      case "mostErrors":
        return copy.sort((a, b) => b.totalErrors - a.totalErrors);
      case "mostExpensive":
        return copy.sort(
          (a, b) => (b.totalCostUsd ?? 0) - (a.totalCostUsd ?? 0),
        );
      default:
        return copy;
    }
  }, [filtered, sortKey]);

  // Max events for progress bar normalization
  const maxEvents = useMemo(
    () => Math.max(1, ...sorted.map((s) => s.totalEvents)),
    [sorted],
  );

  // Load more
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    const lastSession = sorted[sorted.length - 1];
    if (!lastSession) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/sessions?limit=20&cursor=${lastSession.id}`,
      );
      if (res.ok) {
        const data = await res.json();
        const newSessions: DashboardSession[] = data.sessions ?? [];
        if (newSessions.length === 0 || !data.nextCursor) {
          setHasMore(false);
        }
        setExtraSessions((prev) => [...prev, ...newSessions]);
      }
    } catch {
      // silently fail
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, sorted]);

  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: "lastActive", label: "Last active" },
    { key: "mostEvents", label: "Most events" },
    { key: "mostErrors", label: "Most errors" },
    { key: "mostExpensive", label: "Most expensive" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-white/[0.06]">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-white">Sessions</h1>
            <span className="text-[11px] font-medium text-white/40 bg-white/[0.06] px-2 py-0.5 rounded-full tabular-nums">
              {allSessions.length}
            </span>
          </div>
        </div>

        {/* Search + Sort row */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-3">
          {/* Search - full width on mobile */}
          <div className="relative w-full sm:flex-1 sm:min-w-[200px] sm:max-w-md">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-3.5 sm:h-3.5 text-white/20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search by key, ID, agent, model..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl sm:rounded-lg pl-10 sm:pl-9 pr-3 py-3 sm:py-2 text-sm sm:text-xs text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/[0.12] focus:bg-white/[0.06] transition-colors"
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

          {/* Sort - horizontal scroll on mobile */}
          <div className="flex items-center gap-1 bg-white/[0.04] rounded-xl sm:rounded-lg p-1 sm:p-0.5 overflow-x-auto scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setSortKey(opt.key)}
                className={`px-4 sm:px-3 py-2.5 sm:py-1.5 rounded-lg sm:rounded-md text-sm sm:text-xs font-medium transition-colors whitespace-nowrap min-h-[44px] sm:min-h-0 ${
                  sortKey === opt.key
                    ? "bg-white/10 text-white"
                    : "text-white/30 active:text-white/50 sm:hover:text-white/50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5">
        {sorted.length === 0 ? (
          <div className="flex items-center justify-center h-40">
            <div className="flex flex-col items-center gap-2">
              {search ? (
                <>
                  <svg
                    className="w-8 h-8 text-white/10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <span className="text-sm sm:text-xs text-white/30 text-center">
                    No sessions matching &quot;{search}&quot;
                  </span>
                  <button
                    onClick={() => setSearch("")}
                    className="text-sm text-blue-400/60 hover:text-blue-400 transition-colors py-2 px-4 min-h-[44px]"
                  >
                    Clear search
                  </button>
                </>
              ) : (
                <>
                  <svg
                    className="w-8 h-8 text-white/10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <polygon points="12,2 2,7 12,12 22,7" />
                    <polyline points="2,17 12,22 22,17" />
                    <polyline points="2,12 12,17 22,12" />
                  </svg>
                  <span className="text-sm sm:text-xs text-white/30">No sessions yet</span>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-2">
            {sorted.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                maxEvents={maxEvents}
              />
            ))}

            {/* Load more */}
            {hasMore && sorted.length >= 10 && (
              <div className="flex justify-center pt-4 pb-2">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="flex items-center gap-2 px-5 py-3 sm:py-2 rounded-xl sm:rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm sm:text-xs text-white/40 hover:text-white/60 active:bg-white/[0.08] hover:bg-white/[0.06] transition-colors disabled:opacity-50 min-h-[44px]"
                >
                  {loadingMore ? (
                    <>
                      <div className="w-4 h-4 sm:w-3.5 sm:h-3.5 border-2 border-white/10 border-t-blue-400 rounded-full animate-spin" />
                      Loading...
                    </>
                  ) : (
                    "Load more sessions"
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

function getErrorRateBadge(
  totalErrors: number,
  totalEvents: number,
): { cls: string; label: string } | null {
  if (totalEvents === 0 || totalErrors === 0) return null;
  const rate = (totalErrors / totalEvents) * 100;
  if (rate > 20) {
    return {
      cls: "bg-red-500/20 text-red-400 border border-red-500/30",
      label: `${Math.round(rate)}% errors`,
    };
  }
  if (rate >= 5) {
    return {
      cls: "bg-amber-500/20 text-amber-400 border border-amber-500/30",
      label: `${Math.round(rate)}% errors`,
    };
  }
  return null;
}

function SessionCard({
  session,
  maxEvents,
}: {
  session: DashboardSession;
  maxEvents: number;
}) {
  const progressPct = Math.round((session.totalEvents / maxEvents) * 100);
  const isActiveNow = isActiveSession(session.lastSeenAt);
  const errorBadge = getErrorRateBadge(session.totalErrors, session.totalEvents);

  return (
    <Link
      href={`/sessions/${session.id}`}
      className={`block rounded-xl border transition-colors p-4 group min-h-[100px] ${
        isActiveNow
          ? "border-emerald-500/20 bg-emerald-500/[0.03] active:bg-emerald-500/[0.06] sm:hover:bg-emerald-500/[0.05]"
          : "border-white/[0.06] bg-white/[0.02] active:bg-white/[0.05] sm:hover:bg-white/[0.04]"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        {/* Left: identity */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {isActiveSession(session.lastSeenAt) && (
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" title="Active now" />
            )}
            <span className="text-base sm:text-sm font-mono font-medium text-white/80 truncate">
              {session.key ?? session.id.slice(0, 14) + "\u2026"}
            </span>
            {(() => {
              const cfg = SESSION_TYPE_CONFIG[detectSessionType(session.id)];
              return (
                <span className={`shrink-0 inline-flex items-center gap-0.5 text-[11px] sm:text-[10px] px-2 sm:px-1.5 py-1 sm:py-0.5 rounded border ${cfg.badgeClass}`}>
                  <span>{cfg.icon}</span>
                  <span>{cfg.label}</span>
                </span>
              );
            })()}
            {session.label && (
              <span className="text-[11px] sm:text-[10px] text-blue-300/60 bg-blue-500/10 border border-blue-500/10 px-2 sm:px-1.5 py-1 sm:py-0.5 rounded shrink-0">
                {session.label}
              </span>
            )}
            {errorBadge && (
              <span className={`text-[11px] sm:text-[10px] px-2 sm:px-1.5 py-1 sm:py-0.5 rounded shrink-0 font-medium ${errorBadge.cls}`}>
                {errorBadge.label}
              </span>
            )}
            {isActiveNow && (
              <span className="text-[10px] sm:text-[9px] text-emerald-400/70 bg-emerald-500/10 border border-emerald-500/15 px-2 sm:px-1.5 py-1 sm:py-0.5 rounded-full shrink-0 font-medium">
                active
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-2 sm:mt-1.5 text-xs sm:text-[11px] text-white/30">
            {session.agentId && (
              <span className="flex items-center gap-1.5 sm:gap-1">
                <svg
                  className="w-4 h-4 sm:w-3 sm:h-3 text-white/20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <span className="truncate max-w-[140px] sm:max-w-[120px]">{session.agentId}</span>
              </span>
            )}
            {session.model && (
              <span className="text-white/20 truncate max-w-[160px] sm:max-w-[140px]">
                {session.model.split("/").pop()}
              </span>
            )}
          </div>
        </div>

        {/* Right: time info */}
        <div className="text-right shrink-0">
          <div className="text-xs sm:text-[11px] text-white/30">
            {formatDistanceToNow(new Date(session.lastSeenAt), {
              addSuffix: true,
            })}
          </div>
          <div className="text-[11px] sm:text-[10px] text-white/15 mt-0.5">
            {formatDuration(session.startedAt, session.lastSeenAt)}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 mt-4 sm:mt-3">
        {/* Events with progress bar */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1.5 sm:mb-1">
            <span className="text-[11px] sm:text-[10px] text-white/25">Events</span>
            <span className="text-xs sm:text-[11px] font-mono font-medium text-white/50 tabular-nums">
              {session.totalEvents.toLocaleString()}
            </span>
          </div>
          <div className="w-full h-1.5 sm:h-1 bg-white/[0.04] rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500/40 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Errors */}
        <div className="text-center shrink-0 w-16 sm:w-14">
          <div className="text-[11px] sm:text-[10px] text-white/25 mb-1 sm:mb-0.5">Errors</div>
          <span
            className={`text-sm sm:text-xs font-mono font-semibold tabular-nums ${
              session.totalErrors > 0 ? "text-red-400" : "text-white/20"
            }`}
          >
            {session.totalErrors}
          </span>
        </div>

        {/* Tokens */}
        <div className="text-center shrink-0 w-16 sm:w-14">
          <div className="text-[11px] sm:text-[10px] text-white/25 mb-1 sm:mb-0.5">Tokens</div>
          <span className="text-sm sm:text-xs font-mono text-white/40 tabular-nums">
            {formatTokens(session.totalTokens)}
          </span>
        </div>

        {/* Cost */}
        <div className="text-center shrink-0 w-16 sm:w-14">
          <div className="text-[11px] sm:text-[10px] text-white/25 mb-1 sm:mb-0.5">Cost</div>
          <span
            className={`text-sm sm:text-xs font-mono font-semibold tabular-nums ${
              session.totalCostUsd && session.totalCostUsd > 0
                ? "text-emerald-400"
                : "text-white/20"
            }`}
          >
            {formatCost(session.totalCostUsd)}
          </span>
        </div>

        {/* Arrow */}
        <svg
          className="w-5 h-5 sm:w-4 sm:h-4 text-white/10 group-hover:text-white/25 transition-colors shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="9,18 15,12 9,6" />
        </svg>
      </div>
    </Link>
  );
}
