"use client";

/**
 * Horizontal pipeline strip showing agent flow:
 *   ● scout ━━━ ● decoder ━━━ ● synth
 * with the currently-running step highlighted.
 */
import type { AgentStepRender } from "./types";

interface Props {
  agents: AgentStepRender[];
}

export function PipelineProgress({ agents }: Props) {
  if (!agents.length) return null;

  return (
    <div className="pipeline-progress">
      {agents.map((a, i) => {
        const isLast = i === agents.length - 1;
        return (
          <div key={a.id} className="pp-cell">
            <div className={"pp-node " + a.status}>
              <span className="pp-dot" />
              <span className="pp-label">{a.name}</span>
              {a.status === "running" && <span className="pp-sub">running…</span>}
              {a.status === "done" && <span className="pp-sub done">✓ done</span>}
              {a.status === "error" && <span className="pp-sub err">✗ failed</span>}
              {a.status === "queued" && <span className="pp-sub">queued</span>}
            </div>
            {!isLast && <div className={"pp-edge " + (agents[i + 1].status !== "queued" ? "active" : "")} />}
          </div>
        );
      })}
    </div>
  );
}
