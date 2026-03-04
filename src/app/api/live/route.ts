import { NextRequest } from "next/server";
import { addSseListener, removeSseListener } from "@/lib/events";
import { auth } from "@/lib/auth-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  // Server-side auth check — middleware marks /api/live as public for browser
  // SSE compatibility, so we verify the session cookie here instead.
  const session = await auth();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(": connected\n\n"));

      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {}
      };

      addSseListener(send);

      req.signal.addEventListener("abort", () => {
        removeSseListener(send);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
