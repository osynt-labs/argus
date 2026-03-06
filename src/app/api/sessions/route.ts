import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100);
    const cursor = searchParams.get("cursor");

    const sessions = await prisma.session.findMany({
      orderBy: { lastSeenAt: "desc" },
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: {
        _count: { select: { events: true } },
      },
    });

    const nextCursor =
      sessions.length === limit ? sessions[sessions.length - 1].id : null;
    return NextResponse.json({ sessions, nextCursor });
  } catch (err) {
    console.error("[api/sessions] DB query failed:", err);
    return NextResponse.json(
      { error: "Database unavailable", sessions: [], nextCursor: null },
      { status: 503 },
    );
  }
}
