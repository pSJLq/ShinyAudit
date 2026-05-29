/**
 * Maps SSE events from /api/investigate into chat message updates.
 *
 * The orchestrator emits StreamEvent objects (see lib/somnia/orchestrator.ts).
 * Here we project them onto the SwarmMsg model the UI renders.
 */

import type { StreamEvent } from "@/lib/investigate-client";
import type {
  AgentStepRender,
  Block,
  Citation,
  SwarmMsg,
  Verdict,
  VerdictGlyphKind,
  VerdictTone
} from "@/components/chat/types";
import { AGENT_EXPLORER_URL } from "@/lib/somnia/chains";

export interface PartialReply {
  msg: SwarmMsg;
  costAgents: number;
  costService: number;
}

export function emptyReply(id: string, title: { kind: string; target: string }): SwarmMsg {
  return {
    id,
    role: "swarm",
    status: "planning",
    title,
    costTotal: null,
    agentsCost: null,
    serviceCost: null,
    sealed: false,
    duration: null,
    view: "user",
    agents: [],
    verdict: null,
    blocks: [],
    citations: []
  };
}

const SLUG_TO_NAME: Record<string, string> = {
  "json-fetch": "scout-fetch",
  "llm-inference": "synthesizer",
  "llm-parse-website": "web-parser"
};

const PRETTY_NAMES: Record<string, string> = {
  scout: "scout-fetch",
  decoder: "contract-decoder",
  "decoder.fetch": "decoder-fetch",
  tracer: "flow-tracer",
  profiler: "wallet-profiler",
  xray: "token-xray",
  stealth: "stealth-hunter",
  synth: "synthesizer",
  watcher: "watcher"
};

/** Pretty-print dynamic ids like "planner.2" or "tool.1.3". */
function prettyToolName(id: string, slug: string): string {
  if (id.startsWith("planner.")) return `planner · round ${Number(id.split(".")[1]) + 1}`;
  if (id.startsWith("tool.")) {
    const [, round, idx] = id.split(".");
    return `tool · r${Number(round) + 1}.${Number(idx) + 1}`;
  }
  if (slug === "json-fetch") return "json-fetch";
  if (slug === "llm-inference") return "llm-inference";
  return id;
}

const VERDICT_GLYPHS: Record<string, VerdictGlyphKind> = {
  audit: "shield",
  profile: "wallet",
  trace: "flow",
  "x-ray": "token",
  xray: "token",
  watch: "bell",
  stealth: "shield"
};

/**
 * Apply one StreamEvent to the in-flight SwarmMsg, returning a new copy.
 */
export function applyEvent(curr: SwarmMsg, ev: StreamEvent): SwarmMsg {
  switch (ev.type) {
    case "quote": {
      return {
        ...curr,
        agentsCost: ev.agents,
        serviceCost: ev.service,
        costTotal: ev.total
      };
    }
    case "plan": {
      // Agent loop emits multiple `plan` events to *append* new tool steps
      // as the planner discovers them. We merge by id rather than replace.
      const incoming: AgentStepRender[] = ev.steps.map((s) => ({
        id: s.id,
        name: PRETTY_NAMES[s.id] || prettyToolName(s.id, s.slug) || SLUG_TO_NAME[s.slug] || s.id,
        slug: s.slug,
        status: "queued",
        meta: s.description,
        logs: []
      }));
      const merged: AgentStepRender[] = [...curr.agents];
      for (const inc of incoming) {
        const idx = merged.findIndex((a) => a.id === inc.id);
        if (idx === -1) merged.push(inc);
        else merged[idx] = { ...merged[idx], meta: inc.meta };
      }
      return { ...curr, status: "streaming", agents: merged };
    }
    case "started": {
      return mutateAgent(curr, ev.stepId, (a) => ({ ...a, status: "running", meta: `${a.meta} · running` }));
    }
    case "log": {
      return mutateAgent(curr, ev.stepId, (a) => ({
        ...a,
        logs: [...a.logs.slice(-3), { txt: ev.line }]
      }));
    }
    case "txhash": {
      return mutateAgent(curr, ev.stepId, (a) => ({
        ...a,
        logs: [...a.logs, { txt: `tx ${shortHash(ev.hash)} broadcast · waiting consensus` }]
      }));
    }
    case "request": {
      return mutateAgent(curr, ev.stepId, (a) => ({
        ...a,
        requestId: ev.requestId,
        logs: [
          ...a.logs,
          { txt: `requestId ${ev.requestId} · deposit ${ev.deposit} STT`, receipt: ev.requestId }
        ]
      }));
    }
    case "finalized": {
      // Tentative status — `result` event may flip this back to "done"
      // if fallback recovery succeeds despite Failed consensus.
      const status = ev.status === "Success" ? "done"
                   : ev.status === "TimedOut" ? "error"
                   : "running"; // Failed → keep running pending fallback
      return mutateAgent(curr, ev.stepId, (a) => ({
        ...a,
        status,
        meta: `${a.meta} · ${ev.status.toLowerCase()} at block ${ev.finalizedBlock}`
      }));
    }
    case "result": {
      // Result is the raw output of one agent (string or JSON string).
      // If we successfully recovered output via fallback, flip status back to
      // "done" — the on-chain Failed consensus is overridden by a usable
      // validator receipt.
      const recovered = ev.output && ev.output.length > 0;
      const next: SwarmMsg = {
        ...curr,
        agents: curr.agents.map((a) =>
          a.id === ev.stepId
            ? {
                ...a,
                status: recovered ? "done" : a.status,
                logs: [
                  ...a.logs,
                  {
                    txt: ev.output.length > 100
                      ? `✓ output ${ev.output.length} bytes received via validator fallback`
                      : `result: ${ev.output}`
                  }
                ]
              }
            : a
        )
      };
      // Also clear top-level error if it was set by an earlier `error` event
      // for this same step and the recovery succeeded.
      if (recovered && next.status === "error") {
        next.status = "streaming";
        next.errorMessage = undefined;
      }
      return next;
    }
    case "dossier": {
      // Parse markdown into a verdict + body block. The verdict line is
      // lifted into the verdict card, so strip it from the body to avoid
      // showing it twice.
      const verdict = parseVerdictFromMarkdown(ev.markdown, curr.title.kind);
      const bodyBlock: Block = {
        type: "markdown",
        text: stripVerdictLine(ev.markdown)
      };
      const riskList: Block | null = ev.flagged && ev.flagged.length > 0
        ? {
            type: "risk-list",
            items: ev.flagged.map((f) => ({
              sev: f.severity,
              title: f.title,
              desc: f.body,
              ref: f.ref ? { txt: f.ref } : undefined
            }))
          }
        : null;
      const blocks: Block[] = [bodyBlock, ...(riskList ? [riskList] : [])];
      const citations: Citation[] = ev.citations.map((c) => ({
        hash: shortHash(c.id),
        agent: c.tag.split(" · ")[0] || c.tag,
        what: c.tag,
        consensus: "majority",
        receipt: c.url || `${AGENT_EXPLORER_URL}/receipts/${c.id}`
      }));
      return {
        ...curr,
        verdict,
        blocks: [...curr.blocks, ...blocks],
        citations: [...curr.citations, ...citations]
      };
    }
    case "error": {
      if (ev.stepId) {
        // Mark the failing agent + flip the whole message to error so the UI
        // exits the "verdict pending… agents executing" spinner.
        return {
          ...curr,
          status: "error",
          errorMessage: ev.message,
          agents: curr.agents.map((a) =>
            a.id === ev.stepId
              ? { ...a, status: "error", logs: [...a.logs, { txt: `error: ${ev.message}` }] }
              : a
          )
        };
      }
      return { ...curr, status: "error", errorMessage: ev.message };
    }
    case "done": {
      // Don't downgrade error → done. If the message was finalised as error,
      // keep it; otherwise mark sealed.
      if (curr.status === "error") return curr;
      return { ...curr, status: "done", sealed: true };
    }
    default:
      return curr;
  }
}

function mutateAgent(msg: SwarmMsg, stepId: string, fn: (a: AgentStepRender) => AgentStepRender): SwarmMsg {
  return {
    ...msg,
    agents: msg.agents.map((a) => (a.id === stepId ? fn(a) : a))
  };
}

function shortHash(h: string): string {
  if (!h) return h;
  if (h.length < 12) return h;
  return `${h.slice(0, 6)}…${h.slice(-4)}`;
}

/** Strip inline markdown emphasis/code so the verdict headline renders clean. */
function stripMd(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "$1")  // bold
    .replace(/\*(.+?)\*/g, "$1")       // italic
    .replace(/`(.+?)`/g, "$1")          // inline code
    .replace(/^[#>\s-]+/, "")            // leading heading/quote/bullet marks
    .trim();
}

/** Remove the leading "**Verdict:** …" line from the body (it's shown in the card). */
function stripVerdictLine(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let removed = false;
  for (const l of lines) {
    if (!removed && /^\s*\**\s*verdict\s*:?\s*\**/i.test(l)) {
      removed = true; // drop this one line
      continue;
    }
    out.push(l);
  }
  // Trim leading blank lines left behind.
  return out.join("\n").replace(/^\s*\n+/, "");
}

function parseVerdictFromMarkdown(md: string, kind: string): Verdict {
  const glyph = VERDICT_GLYPHS[kind] || "s";
  const rawLines = md.split("\n").map((l) => l.trim());
  let headline = "";

  // 1) Prefer an explicit "**Verdict:** …" line if present.
  for (const l of rawLines) {
    const m = l.match(/^\**\s*verdict\s*:?\s*\**\s*(.+)$/i);
    if (m && m[1]) { headline = stripMd(m[1]); break; }
  }
  // 2) Otherwise first bullet or first substantial paragraph.
  if (!headline) {
    for (const l of rawLines) {
      if (l.startsWith("#") || l.startsWith(">") || !l) continue;
      if (l.startsWith("-") || l.startsWith("*")) { headline = stripMd(l); break; }
      if (l.length > 20) { headline = stripMd(l); break; }
    }
  }
  headline = headline.slice(0, 200);
  if (!headline) headline = "investigation complete — see findings below.";

  // Crude risk-score derivation from headline keywords.
  const tone: VerdictTone = /high|critical|severe|exploit|rug|drain|stolen/i.test(headline)
    ? "red"
    : /mixer|sus|warning|risky|amber/i.test(headline)
      ? "amber"
      : /safe|verified|low|clean|holding/i.test(headline)
        ? "lime"
        : "purple";

  return {
    tone,
    glyph,
    label: kind,
    headline
  };
}
