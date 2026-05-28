/**
 * Browser-side client for /api/investigate.
 *
 * The route emits text/event-stream; we read the body as a stream of
 * `data: <json>` lines and forward parsed events through a callback.
 */

export interface PublicAgentStep {
  id: string;
  slug: "json-fetch" | "llm-inference" | "llm-parse-website";
  fnName: string;
  description: string;
  costEstimateSTT: number;
}

export interface Flagged {
  severity: "high" | "med" | "low";
  title: string;
  body: string;
  ref?: string;
}

export interface Citation {
  id: string;
  tag: string;
  url: string;
}

export type StreamEvent =
  | { type: "quote"; agents: number; service: number; total: number }
  | { type: "plan"; steps: PublicAgentStep[] }
  | { type: "started"; stepId: string; slug: PublicAgentStep["slug"]; fnName: string }
  | { type: "log"; stepId: string; line: string }
  | { type: "txhash"; stepId: string; hash: `0x${string}` }
  | { type: "request"; stepId: string; requestId: string; deposit: string; receiptUrl: string }
  | { type: "finalized"; stepId: string; status: "Success" | "Failed" | "TimedOut" | "None" | "Pending"; finalizedBlock: string }
  | { type: "result"; stepId: string; output: string }
  | { type: "dossier"; markdown: string; flagged: Flagged[]; citations: Citation[]; cost: string }
  | { type: "error"; stepId?: string; message: string }
  | { type: "done" };

export async function investigate(
  prompt: string,
  target: string,
  user: `0x${string}`,
  onEvent: (ev: StreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch("/api/investigate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt, target, user }),
    signal
  });
  if (!res.ok || !res.body) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // SSE events are separated by blank line
    let idx;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const line = block.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      try {
        const ev = JSON.parse(line.slice(6)) as StreamEvent;
        onEvent(ev);
      } catch (err) {
        console.warn("bad SSE event", block, err);
      }
    }
  }
}
