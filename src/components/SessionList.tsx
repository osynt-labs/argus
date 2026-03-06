"use client";

import { formatDistanceToNow } from "date-fns";

interface Session {
  id: string;
  key?: string | null;
  agentId?: string | null;
  model?: string | null;
  lastSeenAt: string;
  totalEvents: number;
  totalErrors: number;
  _count: { events: number };
}

export function SessionList({ sessions }: { sessions: Session[] }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/2 p-4">
      <h3 className="text-xs font-semibold text-white/40 mb-3">
        Active Sessions (1h)
        <span className="ml-2 text-white/20 normal-case font-normal">
          {sessions.length} running
        </span>
      </h3>

      {sessions.length === 0 ? (
        <p className="text-xs text-white/15 text-center py-4">No active sessions</p>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between p-3 rounded-lg bg-white/3 hover:bg-white/5 active:bg-white/6 transition-colors cursor-default"
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs font-mono text-white/70 truncate">
                  {s.key ?? s.id.slice(0, 14) + "\u2026"}
                </div>
                <div className="text-[10px] text-white/25 mt-0.5">
                  {formatDistanceToNow(new Date(s.lastSeenAt), { addSuffix: true })}
                  {s.model && (
                    <span className="ml-2 text-white/15">{s.model.split("/").pop()}</span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0 ml-3">
                <div className="text-xs font-semibold text-white/50">{s._count.events}</div>
                <div className="text-[10px] text-white/20">events</div>
                {s.totalErrors > 0 && (
                  <div className="text-[10px] text-red-400/60">{s.totalErrors} err</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
