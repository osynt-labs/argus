"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { detectSessionType, SESSION_TYPE_CONFIG } from "@/lib/session-types";

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
            <Link
              key={s.id}
              href={`/sessions/${s.id}`}
              className="flex items-center justify-between p-3 rounded-lg bg-white/3 hover:bg-white/[0.07] active:bg-white/[0.06] transition-colors cursor-pointer"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-mono text-white/70 truncate">
                    {s.key ?? s.id.slice(0, 14) + "\u2026"}
                  </span>
                  {(() => {
                    const cfg = SESSION_TYPE_CONFIG[detectSessionType(s.id)];
                    return (
                      <span className={`shrink-0 inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border ${cfg.badgeClass}`}>
                        <span>{cfg.icon}</span>
                        <span>{cfg.label}</span>
                      </span>
                    );
                  })()}
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
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
