export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const BUCKET_MS = {
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
} as const;

type BucketSize = keyof typeof BUCKET_MS;

function roundToTimeBucket(date: Date, bucket: BucketSize): string {
  const ms = BUCKET_MS[bucket];
  const rounded = new Date(Math.floor(date.getTime() / ms) * ms);
  return rounded.toISOString();
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const hours = Math.min(
      Math.max(parseInt(searchParams.get("hours") ?? "24", 10) || 24, 1),
      168,
    );
    const bucketParam = searchParams.get("bucket") ?? "hour";
    const bucket: BucketSize =
      bucketParam === "day" ? "day" : "hour";

    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const events = await prisma.event.findMany({
      where: { timestamp: { gte: since } },
      select: {
        timestamp: true,
        type: true,
        status: true,
      },
      orderBy: { timestamp: "asc" },
    });

    const bucketMap = new Map<
      string,
      { total: number; errors: number; tools: number }
    >();

    for (const event of events) {
      const key = roundToTimeBucket(event.timestamp, bucket);
      const entry = bucketMap.get(key) ?? { total: 0, errors: 0, tools: 0 };
      entry.total++;
      if (event.status === "error") entry.errors++;
      if (event.type === "TOOL_CALL") entry.tools++;
      bucketMap.set(key, entry);
    }

    const buckets = Array.from(bucketMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([time, counts]) => ({ time, ...counts }));

    return NextResponse.json({ buckets });
  } catch (err) {
    console.error("[api/analytics/timeline] DB query failed:", err);
    return NextResponse.json(
      { error: "Database unavailable", buckets: [] },
      { status: 503 },
    );
  }
}
