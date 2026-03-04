import { NextRequest } from "next/server";
import { addSseListener, removeSseListener } from "@/lib/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
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
