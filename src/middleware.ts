import { auth } from "@/lib/auth-config";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Always allow: auth routes, health check, ingest API (uses API key auth)
  const publicPaths = [
    "/login",
    "/api/auth",
    "/api/ingest",
    "/api/setup",
    "/api/health",
    "/api/live",   // SSE — auth checked via cookie in browser
  ];

  const isPublic = publicPaths.some((p) => pathname.startsWith(p));
  if (isPublic) return NextResponse.next();

  // Require session for everything else
  if (!req.auth) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
