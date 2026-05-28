/**
 * /api/investigate-native — Somnia-native agentic mode.
 *
 * Same SSE shape as /api/investigate, but the entire investigation is ONE
 * inferToolsChat dispatch on Somnia's LLM agent. The agent self-directs:
 * picks tools from our MCP catalogue, dispatches them on-chain via the
 * validator subcommittee, reasons over results, iterates until done.
 *
 *   user prompt
 *       │
 *       ▼
 *   wallet.writeContract → escrow.dispatchFor → platform.createRequest
 *       │
 *       ▼  ONE Somnia agent receipt covers the whole investigation
 *   inferToolsChat(roles, messages, mcpServerUrls=[shinyaudit/api/mcp], maxIterations=5)
 *       │
 *       ▼  agent's internal loop, all on-chain:
 *       ├─ LLM picks tool ────► validator fetches MCP ──► json-fetch ──► result
 *       ├─ LLM picks tool ────► ...
 *       └─ LLM finishes ──────► response string
 *       ▼
 *   final markdown answer streamed back to UI
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { runNativeAgentic, type StreamEvent } from "@/lib/somnia/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Body = z.object({
  prompt: z.string().min(3).max(2000),
  target: z.string().min(2).max(128),
  user: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "user must be a 0x-prefixed address"),
  maxIterations: z.number().int().min(1).max(10).optional()
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
  const { prompt, target, user, maxIterations } = body.data;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const enqueue = (chunk: string) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(chunk)); } catch { closed = true; }
      };
      const enqueueEv = (ev: Parameters<typeof sse>[0]) => enqueue(sse(ev));

      enqueue(": connected\n\n");
      const heartbeat = setInterval(() => enqueue(": keep-alive\n\n"), 12_000);

      try {
        for await (const ev of runNativeAgentic(prompt, target, user as `0x${string}`, maxIterations ?? 5)) {
          enqueueEv(ev);
        }
      } catch (err) {
        enqueueEv({ type: "error", message: (err as Error).message });
      } finally {
        clearInterval(heartbeat);
        try { controller.close(); } catch { /* already closed */ }
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
