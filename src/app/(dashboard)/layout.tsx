"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import type { ConnectionState } from "@/lib/types";

// Global SSE + data context shared across all dashboard pages
import { createContext, useContext } from "react";

export interface DashboardEvent {
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

export interface DashboardStats {
  total: number;
  last24h: number;
  last1h: number;
  byTool: { toolName: string | null; _count: { toolName: number } }[];
  byType?: { type: string; _count: number }[];
  errorsLast24h: number;
  costUsd24h?: number | null;
  tokenStats: {
    _sum: { inputTokens?: number | null; outputTokens?: number | null; cacheTokens?: number | null };
    _avg: { durationMs?: number | null };
  };
}

export interface DashboardSession {
  id: string;
  key?: string | null;
  agentId?: string | null;
  model?: string | null;
  label?: string | null;
  startedAt?: string;
  lastSeenAt: string;
  totalEvents: number;
  totalTokens?: number;
  totalErrors: number;
  _count: { events: number };
}

interface DashboardContextType {
  events: DashboardEvent[];
  stats: DashboardStats | null;
  sessions: DashboardSession[];
  connState: ConnectionState;
  dbHealthy: boolean;
  lastRefresh: Date | null;
}

const DashboardContext = createContext<DashboardContextType>({
  events: [],
  stats: null,
  sessions: [],
  connState: "disconnected",
  dbHealthy: true,
  lastRefresh: null,
});

export function useDashboard() {
  return useContext(DashboardContext);
}

const REFRESH_MS = 30_000;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [events, setEvents] = useState<DashboardEvent[]>([]);
  const [sessions, setSessions] = useState<DashboardSession[]>([]);
  const [connState, setConnState] = useState<ConnectionState>("disconnected");
  const [dbHealthy, setDbHealthy] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // SSE connection
  const connect = useCallback(() => {
    esRef.current?.close();
    const es = new EventSource("/api/live");
    esRef.current = es;

    es.onopen = () => {
      retryRef.current = 0;
      setConnState("connected");
    };

    es.onmessage = (e) => {
      try {
        const event: DashboardEvent = JSON.parse(e.data);
        setEvents((prev) => [event, ...prev].slice(0, 1000));
        setStats((prev) =>
          prev
            ? {
                ...prev,
                total: prev.total + 1,
                last24h: prev.last24h + 1,
                last1h: prev.last1h + 1,
                errorsLast24h:
                  event.status === "error" || event.error
                    ? prev.errorsLast24h + 1
                    : prev.errorsLast24h,
              }
            : prev,
        );
      } catch {}
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
      setConnState("reconnecting");
      const delay = Math.min(1000 * Math.pow(2, retryRef.current), 30_000);
      retryRef.current++;
      timerRef.current = setTimeout(connect, delay);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(timerRef.current);
      esRef.current?.close();
    };
  }, [connect]);

  // Periodic data refresh
  useEffect(() => {
    const refresh = async () => {
      try {
        const [statsRes, sessionsRes] = await Promise.all([
          fetch("/api/stats"),
          fetch("/api/sessions?limit=20"),
        ]);

        if (statsRes.ok) {
          const data = await statsRes.json();
          if (!data.error) {
            setDbHealthy(true);
            setLastRefresh(new Date());
            setStats({
              total: data.total,
              last24h: data.last24h,
              last1h: data.last1h,
              byTool: (data.byTool ?? []).map((d: any) => ({
                toolName: d.toolName,
                _count: { toolName: d._count?.toolName ?? d._count ?? 0 },
              })),
              byType: data.byType,
              errorsLast24h: data.errorsLast24h,
              costUsd24h: data.costUsd24h ?? null,
              tokenStats: data.tokenStats,
            });
          } else {
            setDbHealthy(false);
          }
        } else {
          setDbHealthy(false);
        }

        if (sessionsRes.ok) {
          const data = await sessionsRes.json();
          setSessions(data.sessions ?? []);
        }
      } catch {
        setDbHealthy(false);
      }
    };

    refresh(); // Initial fetch
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  // Initial events fetch
  useEffect(() => {
    fetch("/api/events?limit=200")
      .then((r) => r.json())
      .then((data) => {
        if (data.events) setEvents(data.events);
      })
      .catch(() => {});
  }, []);

  return (
    <DashboardContext.Provider value={{ events, stats, sessions, connState, dbHealthy, lastRefresh }}>
      <div className="flex h-full min-h-screen">
        <Sidebar connState={connState} dbHealthy={dbHealthy} />
        {/* pb-16 on mobile for bottom nav safe area, lg:pb-0 on desktop */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden pb-16 lg:pb-0">
          {children}
        </div>
      </div>
    </DashboardContext.Provider>
  );
}
