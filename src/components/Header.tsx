"use client";

import { signOut, useSession } from "next-auth/react";
import { useState } from "react";

export function Header({ isLive }: { isLive?: boolean }) {
  const { data: session } = useSession();
  const [showMenu, setShowMenu] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-[#0a0a0f]/95 backdrop-blur-md border-b border-white/5 px-4 h-14 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <span className="text-xl">👁</span>
        <div>
          <span className="font-bold text-sm tracking-tight">Argus</span>
          <span className="text-white/20 text-xs ml-1.5 hidden sm:inline">Observatory</span>
        </div>
        <div className={`flex items-center gap-1.5 ml-2 px-2 py-0.5 rounded-full text-xs border ${
          isLive
            ? "bg-green-500/10 border-green-500/20 text-green-400"
            : "bg-white/5 border-white/10 text-white/30"
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isLive ? "bg-green-400 animate-pulse" : "bg-white/20"}`} />
          {isLive ? "Live" : "Offline"}
        </div>
      </div>

      {/* User menu */}
      <div className="relative">
        <button
          onClick={() => setShowMenu((v) => !v)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/8 transition-colors"
        >
          {session?.user?.image ? (
            <img src={session.user.image} className="w-6 h-6 rounded-full" alt="" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-blue-500/40 flex items-center justify-center text-xs font-bold">
              {session?.user?.name?.[0] ?? "?"}
            </div>
          )}
          <span className="text-xs text-white/60 hidden sm:block">
            {session?.user?.name?.split(" ")[0] ?? "User"}
          </span>
        </button>

        {showMenu && (
          <div className="absolute right-0 top-full mt-2 w-48 rounded-xl bg-[#141420] border border-white/10 shadow-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5">
              <p className="text-xs font-medium text-white/80">{session?.user?.name}</p>
              <p className="text-xs text-white/30 truncate">{session?.user?.email}</p>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
