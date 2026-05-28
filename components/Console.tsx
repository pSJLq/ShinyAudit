"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { investigate, type PublicAgentStep, type StreamEvent } from "@/lib/investigate-client";
import { CreditPanel } from "./CreditPanel";

const STT_USD = 0.10;

function detectTargetType(s: string): "addr" | "tx" | "ens" | "—" {
  s = (s || "").trim();
  if (/^0x[a-fA-F0-9]{64}$/.test(s)) return "tx";
  if (/^0x[a-fA-F0-9]{40}$/.test(s)) return "addr";
  if (/\.eth$/.test(s)) return "ens";
  if (!s) return "—";
  return "ens";
}

type Phase = "idle" | "planning" | "running" | "done" | "error";

interface StepState {
  step: PublicAgentStep;
  status: "queued" | "invoking" | "executing" | "consensus" | "done" | "error";
  logs: string[];
  txHash?: string;
  requestId?: string;
  receiptUrl?: string;
  output?: string;
  progress: number;
}

const QUICK_INTENTS = [
  "audit contract",
  "trace funds",
  "profile wallet",
  "find rug vectors",
  "decode unknown tx",
  "monitor address"
];

export function Console() {
  const { address, isConnected } = useAccount();
  const [intent, setIntent] = useState("");
  const [target, setTarget] = useState("");
  const [focused, setFocused] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [steps, setSteps] = useState<StepState[]>([]);
  const [quote, setQuote] = useState<{ agents: number; service: number; total: number } | null>(null);
  const [dossierUrl, setDossierUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [founderMode, setFounderMode] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const targetType = detectTargetType(target);

  // / focus
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ae = document.activeElement as HTMLElement | null;
      if (e.key === "/" && ae?.tagName !== "TEXTAREA" && ae?.tagName !== "INPUT") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // > sudo dispatch easter egg
  useEffect(() => {
    const t = intent.trim().toLowerCase();
    if (t === "> sudo dispatch" || t === "sudo dispatch") {
      document.body.classList.add("glitch");
      setFounderMode(true);
      setTimeout(() => document.body.classList.remove("glitch"), 360);
    }
  }, [intent]);

  // cancel inflight on unmount
  useEffect(() => () => abortRef.current?.abort(), []);

  const subtotal = useMemo(() => quote?.agents ?? 0, [quote]);
  const service = useMemo(() => (founderMode ? 0 : (quote?.service ?? 0)), [quote, founderMode]);
  const total = subtotal + service;

  async function onDispatch() {
    if (phase === "running" || phase === "planning") return;
    setErrorMsg(null);
    setDossierUrl(null);
    setSteps([]);
    setQuote(null);
    setPhase("planning");

    if (!address) {
      setErrorMsg("connect wallet first");
      setPhase("error");
      return;
    }

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      await investigate(
        intent || "general investigation",
        target || "0x0000000000000000000000000000000000000000",
        address,
        (ev) => onEvent(ev),
        ctrl.signal
      );
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setErrorMsg((err as Error).message);
      setPhase("error");
    }
  }

  function onEvent(ev: StreamEvent) {
    switch (ev.type) {
      case "quote":
        setQuote({ agents: ev.agents, service: ev.service, total: ev.total });
        break;
      case "plan":
        setSteps(ev.steps.map((s) => ({ step: s, status: "queued", logs: [], progress: 0 })));
        setPhase("running");
        break;
      case "started":
        updateStep(ev.stepId, (s) => ({ ...s, status: "invoking" }));
        break;
      case "log":
        updateStep(ev.stepId, (s) => ({ ...s, logs: [...s.logs.slice(-4), ev.line] }));
        break;
      case "txhash":
        updateStep(ev.stepId, (s) => ({ ...s, txHash: ev.hash, status: "executing", progress: 0.4 }));
        break;
      case "request":
        updateStep(ev.stepId, (s) => ({
          ...s,
          requestId: ev.requestId,
          receiptUrl: ev.receiptUrl,
          status: "consensus",
          progress: 0.7
        }));
        break;
      case "finalized":
        updateStep(ev.stepId, (s) => ({ ...s, status: ev.status === "Success" ? "done" : "error", progress: 1 }));
        break;
      case "result":
        updateStep(ev.stepId, (s) => ({ ...s, output: ev.output }));
        break;
      case "dossier":
        // Could open in a modal; for now just blob-download URL
        const blob = new Blob([ev.markdown], { type: "text/markdown" });
        setDossierUrl(URL.createObjectURL(blob));
        break;
      case "error":
        if (ev.stepId) {
          updateStep(ev.stepId, (s) => ({ ...s, status: "error", logs: [...s.logs, `error: ${ev.message}`] }));
        } else {
          setErrorMsg(ev.message);
          setPhase("error");
        }
        break;
      case "done":
        setPhase("done");
        break;
    }
  }

  function updateStep(id: string, fn: (s: StepState) => StepState) {
    setSteps((prev) => prev.map((s) => (s.step.id === id ? fn(s) : s)));
  }

  function reset() {
    abortRef.current?.abort();
    setSteps([]);
    setQuote(null);
    setPhase("idle");
    setErrorMsg(null);
    setDossierUrl(null);
  }

  const canDispatch = isConnected && intent.trim().length > 2 && target.trim().length > 1 && phase !== "running" && phase !== "planning";

  return (
    <section className="section" id="console">
      <div className="container-x">
        <div className="section-eyebrow"><span className="bar" /> 02 · the centerpiece</div>
        <h2 className="section-heading"><span className="prompt">&gt;</span> console</h2>

        {isConnected && (
          <CreditPanel estimatedTotalSTT={quote?.total} />
        )}

        <div className={"console-frame corners" + (focused ? " focused" : "")}>
          <span className="corner-tl" />
          <span className="corner-br" />

          {/* INTENT — violet */}
          <div className="console-region">
            <div className="console-region-h">
              <span className="lab--violet">▸ intent · user</span>
              <span className="bar" />
              <span style={{ color: "var(--ink-muted)" }}>press <kbd style={{ color: "var(--violet)" }}>/</kbd> to focus</span>
            </div>
            <textarea
              ref={inputRef}
              className="intent-input"
              placeholder={'> describe what you want the swarm to uncover…\n  e.g. "audit this contract for owner privileges and hidden mints"'}
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
            />
            <div className="intent-row">
              <div className="quick-chips">
                {QUICK_INTENTS.map((q) => (
                  <button key={q} className="qchip" onClick={() => setIntent(q + " ")}>
                    &gt; {q}
                  </button>
                ))}
              </div>
              <div className="target-picker">
                <span className="target-type">
                  {targetType === "addr" ? "wallet" : targetType === "tx" ? "tx" : targetType === "ens" ? "ens" : "—"}
                </span>
                <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0x… / tx / ens" />
              </div>
            </div>
          </div>

          {/* PLAN / RUNTIME — blue */}
          <div className="console-region">
            <div className="console-region-h">
              <span className="lab--blue">
                ▸ {phase === "idle" ? "execution plan · system" :
                    phase === "planning" ? "planning · system" :
                    phase === "running"  ? "runtime · live on somnia testnet" :
                    phase === "done"     ? "complete · system" :
                                            "error · system"}
              </span>
              <span className="bar" />
              <span style={{ color: "var(--ink-muted)" }}>
                {steps.length || 0} agents · chain 50312
              </span>
            </div>

            {phase === "idle" && (
              <div style={{ color: "var(--ink-secondary)", fontSize: 13, padding: "20px 4px", lineHeight: 1.6 }}>
                <span style={{ color: "var(--violet)" }}>&gt;</span>{" "}
                describe an investigation above and pick a target. the planner will
                pick agents, quote the deposit, and dispatch them on-chain.
              </div>
            )}

            {phase !== "idle" && steps.length === 0 && (
              <div style={{ color: "var(--ink-muted)", fontSize: 12, padding: "20px 4px" }}>
                <span className="spinner" /> planning…
              </div>
            )}

            {steps.length > 0 && (
              <div className="plan-list">
                {steps.map((s) => (
                  <div key={s.step.id} className="runtime-row">
                    <span className={
                      "dot " +
                      (s.status === "done" ? "dot--lime" :
                       s.status === "error" ? "dot--red" :
                       "pulse")
                    } />
                    <div style={{ minWidth: 0 }}>
                      <div className="agent-name">
                        {s.step.id}{" "}
                        <span style={{ color: "var(--ink-muted)", marginLeft: 6 }}>
                          // {s.step.slug}.{s.step.fnName}
                        </span>
                      </div>
                      <div className="agent-log">
                        {s.logs[s.logs.length - 1] ?? s.step.description}
                      </div>
                      <div className="progress"><i style={{ transform: `scaleX(${s.progress})` }} /></div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                      <span className={
                        "status-pill" +
                        (s.status === "done" ? " done" : s.status === "error" ? " error" : "")
                      }>{s.status}</span>
                      <span style={{ color: "var(--ink-muted)", fontSize: 11 }}>
                        {s.receiptUrl ? (
                          <a href={s.receiptUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--violet)" }}>
                            view receipt ↗
                          </a>
                        ) : s.txHash ? (
                          <>tx {s.txHash.slice(0, 6)}…{s.txHash.slice(-4)}</>
                        ) : (
                          <>cost ~ {s.step.costEstimateSTT.toFixed(3)} STT</>
                        )}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {phase === "done" && (
              <div style={{ marginTop: 18, display: "flex", gap: 12, flexWrap: "wrap" }}>
                <a href="#dossier" className="dossier-chip">
                  <span className="dot dot--violet pulse" />
                  &gt; dossier ready · open below ↓
                </a>
                {dossierUrl && (
                  <a className="btn--ghost" href={dossierUrl} download="dossier.md">
                    [ download dossier.md ]
                  </a>
                )}
              </div>
            )}

            {errorMsg && (
              <div style={{ marginTop: 16, padding: 12, border: "1px solid rgba(255,77,77,0.3)", color: "var(--red)", fontSize: 12 }}>
                &gt; error: {errorMsg}
              </div>
            )}
          </div>

          {/* DISPATCH BAR */}
          <div className="dispatch-bar">
            <div className="ledger">
              <div className="ledger-row"><span className="k">agents</span><span className="v">{subtotal.toFixed(4)} STT</span></div>
              <div className="ledger-row">
                <span className="k">service +{founderMode ? "0" : "50"}%</span>
                <span className="v">{service.toFixed(4)} STT</span>
              </div>
              {founderMode && (
                <div className="ledger-row">
                  <span className="k" style={{ color: "var(--violet)" }}>&gt; founder mode</span>
                  <span className="v" style={{ color: "var(--violet)" }}>active</span>
                </div>
              )}
              <div className="ledger-row sep" />
              <div className="ledger-row total">
                <span className="k">total</span>
                <span className="v">{total.toFixed(4)} STT &nbsp;≈ ${(total * STT_USD).toFixed(4)}</span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
              {(phase === "done" || phase === "error") && (
                <button className="btn--ghost" onClick={reset}>&gt; reset</button>
              )}
              <button
                className="dispatch-btn"
                onClick={onDispatch}
                disabled={!canDispatch}
                title={!isConnected ? "connect wallet first" : !intent ? "type an intent" : !target ? "enter a target" : ""}
              >
                <span>&gt;</span>{" "}
                {phase === "planning" ? "planning…" :
                 phase === "running"  ? "dispatching…" :
                 phase === "done"     ? "dispatch again" :
                                         "dispatch swarm"}
                {(phase === "planning" || phase === "running") && <span className="spinner" style={{ marginLeft: 8 }} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
