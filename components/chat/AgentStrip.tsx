"use client";

import { useEffect, useState } from "react";
import type { AgentStepRender } from "./types";
import { AGENT_EXPLORER_URL } from "@/lib/somnia/chains";
import { ValidatorDots } from "./ValidatorDots";
import { LiveRequestStatus } from "./LiveRequestStatus";

interface Props {
  agents: AgentStepRender[];
  streaming: boolean;
  duration: number | null;
}

export function AgentStrip({ agents, streaming, duration }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const allDone = agents.every((a) => a.status === "done");

  useEffect(() => {
    if (allDone && !streaming) {
      const t = setTimeout(() => setCollapsed(true), 2500);
      return () => clearTimeout(t);
    }
  }, [allDone, streaming]);

  if (collapsed && allDone && !streaming) {
    return (
      <div className="agent-strip collapsed" onClick={() => setCollapsed(false)}>
        <span>
          // {agents.length} agents · {duration ? `${duration}s · ` : ""}receipts <span className="check">✓</span>
        </span>
        <span style={{ marginLeft: "auto", color: "var(--fg-faint)" }}>[ expand ]</span>
      </div>
    );
  }

  return (
    <div className="agent-strip">
      {agents.map((a, idx) => (
        <AgentRow key={a.id || a.name + idx} agent={a} />
      ))}
      {allDone && !streaming && (
        <div style={{ alignSelf: "flex-end", marginTop: 4 }}>
          <button className="btn-mini" type="button" onClick={() => setCollapsed(true)}>
            [ collapse ]
          </button>
        </div>
      )}
    </div>
  );
}

function AgentRow({ agent: a }: { agent: AgentStepRender }) {
  // local elapsed counter while running
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (a.status !== "running") return;
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.round((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [a.status]);

  // detect current stage from log tail
  const stage = detectStage(a);

  return (
    <div className="agent-row">
      <div className="agent-row-head">
        <span className={"agent-dot " + a.status}></span>
        <span className="agent-row-name">{a.name}</span>
        <span className={"agent-row-status " + a.status}>
          {a.status === "running" ? `${stage}${elapsed > 0 ? ` · ${elapsed}s` : ""}` : a.status}
        </span>
        {(a.status === "running" || a.status === "done") && <ValidatorDots status={a.status} />}
        <span style={{ color: "var(--fg-faint)", fontSize: 11 }}>// {a.meta}</span>
      </div>
      {a.logs.map((l, li) => (
        <div key={li} className="agent-row-log">
          <span className="arrow">▸</span>
          {l.txt}
          {l.receipt && (
            <a
              className="receipt"
              href={`${AGENT_EXPLORER_URL}/receipts/${l.receipt}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              receipt {shortHash(l.receipt)} ↗
            </a>
          )}
        </div>
      ))}
      {a.requestId && a.status === "running" && (
        <LiveRequestStatus requestId={a.requestId} active={a.status === "running"} />
      )}
    </div>
  );
}

function detectStage(a: AgentStepRender): string {
  const tail = a.logs[a.logs.length - 1]?.txt.toLowerCase() ?? "";
  if (tail.includes("waiting consensus") || tail.includes("still waiting")) return "awaiting consensus";
  if (tail.includes("requestid")) return "request created";
  if (tail.includes("tx ") || tail.includes("broadcast")) return "tx confirmed";
  if (tail.includes("signing")) return "signing tx";
  if (tail.includes("deposit")) return "preparing deposit";
  return "running";
}

function shortHash(h: string): string {
  if (!h || h.length < 12) return h;
  return `${h.slice(0, 6)}…${h.slice(-4)}`;
}
