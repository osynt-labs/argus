"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useState } from "react";
import type { ConnectionState } from "@/lib/types";

const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: "grid", shortcut: "1" },
  { href: "/events", label: "Events", icon: "activity", shortcut: "2" },
  { href: "/sessions", label: "Sessions", icon: "layers", shortcut: "3" },
  { href: "/analytics", label: "Analytics", icon: "bar-chart", shortcut: "4" },
];

function NavIcon({ name, className = "" }: { name: string; className?: string }) {
  const icons: Record<string, React.ReactNode> = {
    grid: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
    activity: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22,12 18,12 15,21 9,3 6,12 2,12" />
      </svg>
    ),
    layers: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12,2 2,7 12,12 22,7" />
        <polyline points="2,17 12,22 22,17" />
        <polyline points="2,12 12,17 22,12" />
      </svg>
    ),
    "bar-chart": (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  };
  return icons[name] ?? null;
}

const CONN_CONFIG: Record<ConnectionState, { label: string; dot: string; text: string }> = {
  connected: { label: "Live", dot: "bg-emerald-400", text: "text-emerald-400" },
  reconnecting: { label: "Reconnecting", dot: "bg-amber-400", text: "text-amber-400" },
  disconnected: { label: "Offline", dot: "bg-zinc-500", text: "text-zinc-500" },
};

export function Sidebar({
  connState = "disconnected",
  dbHealthy = true,
}: {
  connState?: ConnectionState;
  dbHealthy?: boolean;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [collapsed, setCollapsed] = useState(false);
  const cfg = CONN_CONFIG[connState];

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const sidebar = (
    <div className={`flex flex-col h-full ${collapsed ? "w-[60px]" : "w-[220px]"} transition-all duration-200`}>
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-14 shrink-0 border-b border-white/[0.06]">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-sm font-bold shrink-0">
          A
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight">Argus</div>
            <div className="text-[10px] text-white/30 leading-none">Observatory</div>
          </div>
        )}
      </div>

      {/* Connection status */}
      <div className={`mx-3 mt-3 mb-1 flex items-center gap-2 px-2.5 py-2 rounded-lg bg-white/[0.03] border border-white/[0.04] ${collapsed ? "justify-center" : ""}`}>
        <span className={`w-2 h-2 rounded-full ${cfg.dot} ${connState === "connected" ? "animate-pulse" : ""} shrink-0`} />
        {!collapsed && (
          <span className={`text-[11px] font-medium ${cfg.text}`}>{cfg.label}</span>
        )}
        {!collapsed && !dbHealthy && (
          <span className="ml-auto text-[9px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">DB</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-2 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 ${
                active
                  ? "bg-white/[0.08] text-white shadow-sm shadow-white/[0.02]"
                  : "text-white/40 hover:text-white/70 hover:bg-white/[0.04]"
              } ${collapsed ? "justify-center px-0" : ""}`}
            >
              <NavIcon
                name={item.icon}
                className={`w-[18px] h-[18px] shrink-0 ${active ? "text-blue-400" : "text-white/30 group-hover:text-white/50"}`}
              />
              {!collapsed && <span>{item.label}</span>}
              {!collapsed && (
                <span className={`ml-auto text-[10px] font-mono ${active ? "text-white/20" : "text-white/10"}`}>
                  {item.shortcut}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className={`shrink-0 border-t border-white/[0.06] p-2 ${collapsed ? "px-1" : ""}`}>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-white/40 hover:text-white/60 hover:bg-white/[0.04] transition-colors ${collapsed ? "justify-center px-0" : ""}`}
        >
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500/40 to-violet-500/40 flex items-center justify-center text-[11px] font-bold text-white/70 shrink-0">
            {session?.user?.name?.[0]?.toUpperCase() ?? "?"}
          </div>
          {!collapsed && (
            <div className="text-left min-w-0 flex-1">
              <div className="text-xs font-medium text-white/60 truncate">{session?.user?.name ?? "User"}</div>
              <div className="text-[10px] text-white/20">Sign out</div>
            </div>
          )}
        </button>
      </div>

      {/* Collapse toggle (desktop only) */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="hidden lg:flex items-center justify-center h-8 border-t border-white/[0.06] text-white/15 hover:text-white/30 transition-colors"
      >
        <svg className={`w-3.5 h-3.5 transition-transform ${collapsed ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="15,18 9,12 15,6" />
        </svg>
      </button>
    </div>
  );

  return (
    <>
      {/* ══════════════════════════════════════════════════════════════
          MOBILE: Bottom Navigation Bar (iOS/Android standard pattern)
          ══════════════════════════════════════════════════════════════ */}
      <nav 
        className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0a0a0f]/95 backdrop-blur-lg border-t border-white/[0.08]"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex items-center justify-around h-16">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-1 min-w-[64px] min-h-[44px] px-3 py-2 rounded-xl transition-colors ${
                  active
                    ? "text-blue-400"
                    : "text-white/40 active:text-white/60"
                }`}
              >
                <NavIcon
                  name={item.icon}
                  className={`w-6 h-6 ${active ? "text-blue-400" : "text-white/40"}`}
                />
                <span className={`text-[10px] font-medium ${active ? "text-blue-400" : "text-white/40"}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
        
        {/* Connection indicator on mobile bottom nav */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#0a0a0f] border border-white/[0.08] ${connState === "connected" ? "" : "border-amber-500/30"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${connState === "connected" ? "animate-pulse" : ""}`} />
            <span className={`text-[9px] font-medium ${cfg.text}`}>{cfg.label}</span>
            {!dbHealthy && (
              <span className="text-[8px] text-red-400 font-semibold">DB</span>
            )}
          </div>
        </div>
      </nav>

      {/* ══════════════════════════════════════════════════════════════
          DESKTOP: Traditional sidebar
          ══════════════════════════════════════════════════════════════ */}
      <div className="hidden lg:flex shrink-0 bg-[#0a0a0f] border-r border-white/[0.06]">
        {sidebar}
      </div>
    </>
  );
}
