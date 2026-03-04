import { NextRequest, NextResponse } from "next/server";
import { validateApiKey, getApiKeyFromRequest } from "@/lib/auth";
import { ingestEvent, IngestPayload } from "@/lib/events";
import { check as checkRateLimit } from "@/lib/rate-limit";

/** Maximum allowed request body size: 1 MB. */
const MAX_BODY_BYTES = 1_048_576;

export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────
  const key = getApiKeyFromRequest(req);
  if (!key || !(await validateApiKey(key))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Rate limiting (sliding window, 100 req / min / key) ────────
  const rl = checkRateLimit(key);
  if (!rl.allowed) {
    const retryAfterSec = Math.ceil((rl.resetAt - Date.now()) / 1000);
    return NextResponse.json(
      {
        error: "Too Many Requests",
        message:
          "Rate limit exceeded. Maximum 100 requests per minute per API key.",
        retryAfterSeconds: retryAfterSec > 0 ? retryAfterSec : 1,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSec > 0 ? retryAfterSec : 1),
          "X-RateLimit-Limit": "100",
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
        },
      }
    );
  }

  // ── Body size check (reject > 1 MB) ────────────────────────────
  const contentLength = req.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
    return NextResponse.json(
      {
        error: "Payload Too Large",
        message: `Request body must not exceed ${MAX_BODY_BYTES} bytes (1 MB).`,
      },
      { status: 413 }
    );
  }

  // Read the raw body to enforce the limit even when Content-Length
  // is absent or lies (e.g. chunked transfer encoding).
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ error: "Failed to read request body" }, { status: 400 });
  }

  if (Buffer.byteLength(rawBody, "utf-8") > MAX_BODY_BYTES) {
    return NextResponse.json(
      {
        error: "Payload Too Large",
        message: `Request body must not exceed ${MAX_BODY_BYTES} bytes (1 MB).`,
      },
      { status: 413 }
    );
  }

  // ── Parse JSON ──────────────────────────────────────────────────
  let body: IngestPayload | IngestPayload[];
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // ── Ingest ──────────────────────────────────────────────────────
  const payloads = Array.isArray(body) ? body : [body];
  const results = await Promise.allSettled(payloads.map(ingestEvent));
  const errors = results.filter((r) => r.status === "rejected").length;

  return NextResponse.json(
    {
      ok: true,
      processed: payloads.length - errors,
      errors,
    },
    {
      headers: {
        "X-RateLimit-Limit": "100",
        "X-RateLimit-Remaining": String(rl.remaining),
        "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
      },
    }
  );
}
