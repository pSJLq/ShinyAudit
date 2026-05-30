import { NextRequest } from "next/server";
import { z } from "zod";
import { runInvestigation, type StreamEvent } from "@/lib/somnia/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // Vercel Hobby plan cap (15 min only on Pro+)

const Body = z.object({
  prompt: z.string().min(3).max(2000),
  // target is OPTIONAL — discovery / general questions ("which projects are
  // building this week?", "what's trending?") have no address. Empty/missing
  // normalizes to "—" and the orchestrator routes to discovery/free flows.
  target: z.string().max(128).optional().default("—"),
  user: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "user must be a 0x-prefixed address")
});

function sse(ev: StreamEvent | { type: "comment"; msg: string }): string {
  return `data: ${JSON.stringify(ev)}\n\n`;
}

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const body = Body.safeParse(json);
  if (!body.success) {
    return new Response(JSON.stringify({ error: body.error.flatten() }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }
  const { prompt, target, user } = body.data;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const enqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      const enqueueEv = (ev: Parameters<typeof sse>[0]) => enqueue(sse(ev));

      // Immediately emit a comment so proxies / dev-mode keep the connection alive.
      enqueue(": connected\n\n");
      const heartbeat = setInterval(() => enqueue(": keep-alive\n\n"), 12_000);

      try {
        for await (const ev of runInvestigation(prompt, target, user as `0x${string}`)) {
          enqueueEv(ev);
        }
      } catch (err) {
        enqueueEv({ type: "error", message: (err as Error).message });
      } finally {
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    }
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no"
    }
  });
}
