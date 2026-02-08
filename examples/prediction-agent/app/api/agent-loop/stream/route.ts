import { agentLoop } from "@/lib/agent-loop";

/**
 * SSE stream of live agent actions.
 * Clients connect to receive real-time updates as agents research, predict, and bet.
 */
export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial status
      const status = agentLoop.getStatus();
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "status", ...status })}\n\n`
        )
      );

      // Send recent actions as backfill
      const recent = agentLoop.getActionLog(10);
      for (const action of recent) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ eventType: "action", ...action })}\n\n`
          )
        );
      }

      // Subscribe to new actions
      const unsubscribe = agentLoop.subscribe((action) => {
        try {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ eventType: "action", ...action })}\n\n`
            )
          );
        } catch {
          // Client disconnected
          unsubscribe();
        }
      });

      // Keep-alive ping every 30s
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "ping", timestamp: Date.now() })}\n\n`
            )
          );
        } catch {
          clearInterval(pingInterval);
          unsubscribe();
        }
      }, 30_000);

      // Cleanup on close
      const cleanup = () => {
        clearInterval(pingInterval);
        unsubscribe();
      };

      // Use signal if available for cleanup
      if (typeof AbortSignal !== "undefined") {
        const signal = new AbortController().signal;
        signal.addEventListener("abort", cleanup);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
