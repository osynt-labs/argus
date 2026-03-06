import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("session_id");
    const type = searchParams.get("type");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200);
    const cursor = searchParams.get("cursor");
    const since = searchParams.get("since");

    const where: any = {};
    if (sessionId) where.sessionId = sessionId;
    if (type) where.type = type;
    if (since) where.timestamp = { gte: new Date(since) };

    const events = await prisma.event.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    const nextCursor =
      events.length === limit ? events[events.length - 1].id : null;

    return NextResponse.json({ events, nextCursor });
  } catch (err) {
    console.error("[api/events] DB query failed:", err);
    return NextResponse.json(
      { error: "Database unavailable", events: [], nextCursor: null },
      { status: 503 },
    );
  }
}
