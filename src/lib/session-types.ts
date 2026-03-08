export type SessionType = 'cron' | 'subagent' | 'telegram' | 'main' | 'unknown' | 'other';

export function detectSessionType(id: string): SessionType {
  const lower = id.toLowerCase();
  if (lower === 'unknown') return 'unknown';
  if (lower.includes('cron')) return 'cron';
  if (lower.includes('subagent')) return 'subagent';
  if (lower.includes('telegram')) return 'telegram';
  if (lower.includes('agent:main')) return 'main';
  return 'other';
}

export const SESSION_TYPE_CONFIG: Record<SessionType, { icon: string; label: string; badgeClass: string }> = {
  cron:     { icon: '🕐', label: 'Cron',      badgeClass: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/20' },
  subagent: { icon: '🤖', label: 'Sub-agent', badgeClass: 'bg-purple-500/15 text-purple-300 border-purple-500/20' },
  telegram: { icon: '💬', label: 'Telegram',  badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-500/20'         },
  main:     { icon: '👤', label: 'Main',      badgeClass: 'bg-blue-500/15 text-blue-300 border-blue-500/20'      },
  unknown:  { icon: '❓', label: 'Unknown',   badgeClass: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/20'      },
  other:    { icon: '🔲', label: 'Session',   badgeClass: 'bg-white/[0.06] text-white/40 border-white/[0.06]'    },
};
