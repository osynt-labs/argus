import { NextRequest, NextResponse } from "next/server";
import { validateApiKey, getApiKeyFromRequest } from "@/lib/auth";
import { ingestEvent, IngestPayload } from "@/lib/events";

export async function POST(req: NextRequest) {
  const key = getApiKeyFromRequest(req);
  if (!key || !(await validateApiKey(key))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: IngestPayload | IngestPayload[];
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payloads = Array.isArray(body) ? body : [body];
  const results = await Promise.allSettled(payloads.map(ingestEvent));
  const errors = results.filter((r) => r.status === "rejected").length;

  return NextResponse.json({
    ok: true,
    processed: payloads.length - errors,
    errors,
  });
}
