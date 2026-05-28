"use client";

import { useEffect, useState } from "react";
import { SMark } from "./SMark";
import { AgentStrip } from "./AgentStrip";
import { PipelineProgress } from "./PipelineProgress";
import { BlockRenderer, CitationsBlock, VerdictView } from "./ChatBlocks";
import type { SwarmMsg } from "./types";
import { AGENT_EXPLORER_URL } from "@/lib/somnia/chains";

export function SwarmReply({ msg }: { msg: SwarmMsg }) {
  const isStreaming = msg.status === "streaming" || msg.status === "planning";
  const [view, setView] = useState<"user" | "founder">(msg.view || "user");

  // live elapsed counter — increments every second while the reply is streaming
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!isStreaming) return;
    const start = Date.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed(Math.round((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [isStreaming]);

  return (
    <div className="msg-swarm">
      <div className="swarm-avatar">
        <SMark size={44} />
      </div>
      <div className="swarm-card">
        <div className="swarm-header">
          <div className="swarm-title">
            <span style={{ color: "var(--fg-mute)" }}>&gt;</span>
            <span className="kind">{msg.title.kind}</span>
            <span className="target">· {msg.title.target}</span>
            {msg.sealed && <span className="sealed">sealed · immutable</span>}
            {isStreaming && (
              <span
                className="sealed"
                style={{ color: "var(--blue)", borderColor: "rgba(110,110,237,0.5)" }}
              >
                streaming · live
              </span>
            )}
          </div>
          <div className="swarm-meta">
            {msg.costTotal != null ? (
              <span
                className="cost"
                title={
                  msg.agentsCost != null && msg.serviceCost != null
                    ? `agents ${msg.agentsCost.toFixed(3)} STT + service ${msg.serviceCost.toFixed(3)} STT`
                    : undefined
                }
              >
                {msg.agents.length} agents · {msg.costTotal.toFixed(3)} STT
              </span>
            ) : (
              <span className="cost" style={{ color: "var(--fg-faint)" }}>
                cost pending…
              </span>
            )}
            {msg.citations.length > 0 && (
              <a
                className="receipts"
                href={`${AGENT_EXPLORER_URL}/receipts/${msg.citations[0].hash.replace(/[…\.]+/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                view all receipts ↗
              </a>
            )}
          </div>
        </div>

        {msg.status === "planning" && (
          <div style={{ padding: "12px 0", color: "var(--fg-mute)", fontSize: 13 }}>
            &gt; planning… selecting agents
            <span className="cursor" style={{ marginLeft: 4 }} />
          </div>
        )}

        {msg.agents && msg.agents.length > 0 && (
          <>
            {isStreaming && <PipelineProgress agents={msg.agents} />}
            <AgentStrip agents={msg.agents} streaming={isStreaming} duration={msg.duration} />
          </>
        )}

        {msg.verdict && <VerdictView verdict={msg.verdict} />}

        {msg.blocks &&
          msg.blocks.map((b, idx) => (
            <BlockRenderer key={idx} block={b} view={view} onSetView={setView} />
          ))}

        {msg.citations && msg.citations.length > 0 && <CitationsBlock citations={msg.citations} />}

        {isStreaming && msg.verdict == null && msg.agents.length > 0 && (
          <div style={{ marginTop: 18, fontSize: 12, color: "var(--fg-faint)" }}>
            &gt; verdict pending… agents executing on Somnia ·{" "}
            <span style={{ color: "var(--fg-mute)" }}>
              {elapsed}s elapsed · subcommittee finalisation usually 10–60s
            </span>
            <span className="cursor" style={{ marginLeft: 4 }} />
          </div>
        )}

        {msg.status === "error" && msg.errorMessage && (
          <div className="block callout danger" style={{ marginTop: 14 }}>
            <span className="sym">‼</span>
            <span>{msg.errorMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
}
