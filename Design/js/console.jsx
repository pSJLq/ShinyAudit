/* global React */
const { useState, useEffect, useRef, useMemo } = React;

const STT_USD = 0.10;

function detectTargetType(s) {
  s = (s || "").trim();
  if (/^0x[a-fA-F0-9]{64}$/.test(s)) return "tx";
  if (/^0x[a-fA-F0-9]{40}$/.test(s)) return "addr";
  if (/\.eth$/.test(s)) return "ens";
  if (!s) return "—";
  return "ens";
}

function Console({ onDispatched }) {
  const [intent, setIntent] = useState("");
  const [target, setTarget] = useState("0xdrop4f81b3c…aef9a2");
  const [focused, setFocused] = useState(false);
  const [phase, setPhase] = useState("plan"); // plan | running | done
  const [progress, setProgress] = useState([0,0,0,0]);
  const [statuses, setStatuses] = useState(["queued","queued","queued","queued"]);
  const [logIdx, setLogIdx] = useState([0,0,0,0]);
  const inputRef = useRef(null);

  const agents = window.MOCK.agents;
  const subtotal = agents.reduce((a, b) => a + b.cost, 0);
  const service = subtotal * 0.5;
  const total = subtotal + service;
  const targetType = detectTargetType(target);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "/" && document.activeElement?.tagName !== "TEXTAREA" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // sudo easter egg
  const [founderMode, setFounderMode] = useState(false);
  useEffect(() => {
    if (intent.trim().toLowerCase() === "> sudo dispatch" || intent.trim().toLowerCase() === "sudo dispatch") {
      document.body.classList.add("glitch");
      setFounderMode(true);
      setTimeout(() => document.body.classList.remove("glitch"), 360);
    }
  }, [intent]);
  const effectiveService = founderMode ? 0 : service;
  const effectiveTotal = subtotal + effectiveService;

  function dispatch() {
    setPhase("running");
    onDispatched?.();
    // simulate
    const durations = agents.map(a => a.eta * 1000 / 3.5); // accelerated
    agents.forEach((agent, i) => {
      const start = performance.now();
      const total = durations[i] + i * 200;
      const tick = (now) => {
        const t = Math.min(1, (now - start) / total);
        setProgress(prev => { const n = [...prev]; n[i] = t; return n; });
        // status progression
        const stages = ["invoking", "executing", "consensus", "done"];
        const stageIdx = Math.min(stages.length - 1, Math.floor(t * stages.length));
        setStatuses(prev => { const n = [...prev]; n[i] = stages[stageIdx]; return n; });
        if (t >= 1) return;
        requestAnimationFrame(tick);
      };
      setTimeout(() => requestAnimationFrame(tick), i * 200);

      // rolling log
      const logInterval = setInterval(() => {
        setLogIdx(prev => {
          const n = [...prev];
          if (n[i] < agent.log.length - 1) n[i]++;
          return n;
        });
      }, durations[i] / agent.log.length);
      setTimeout(() => clearInterval(logInterval), total);
    });

    const longest = Math.max(...durations) + agents.length * 200 + 400;
    setTimeout(() => setPhase("done"), longest);
  }

  function reset() {
    setPhase("plan");
    setProgress([0,0,0,0]);
    setStatuses(["queued","queued","queued","queued"]);
    setLogIdx([0,0,0,0]);
  }

  return (
    <section className="section" id="console">
      <div className="container">
        <div className="section-eyebrow"><span className="bar" /> 02 · the centerpiece</div>
        <h2 className="section-heading"><span className="prompt">&gt;</span> console</h2>

        <div className={"console-frame corners" + (focused ? " focused" : "")}>
          <span className="corner-tl" /><span className="corner-br" />

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
              placeholder={'> describe what you want the swarm to uncover…\n  e.g. "follow funds from 0xairdrop… and flag any mixer interaction"'}
              value={intent}
              onChange={e => setIntent(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
            />
            <div className="intent-row">
              <div className="quick-chips">
                {window.MOCK.quickIntents.map(q => (
                  <button key={q} className="qchip" onClick={() => setIntent(q + " ")}>
                    &gt; {q}
                  </button>
                ))}
              </div>
              <div className="target-picker">
                <span className="target-type">
                  {targetType === "addr" ? "wallet" : targetType === "tx" ? "tx" : targetType === "ens" ? "ens" : "—"}
                </span>
                <input
                  value={target}
                  onChange={e => setTarget(e.target.value)}
                  placeholder="0x… / tx / ens"
                />
              </div>
            </div>
          </div>

          {/* PLAN / RUNTIME — blue */}
          <div className="console-region">
            <div className="console-region-h">
              <span className="lab--blue">▸ {phase === "plan" ? "execution plan · system" : phase === "running" ? "runtime · system" : "complete · system"}</span>
              <span className="bar" />
              <span style={{ color: "var(--ink-muted)" }}>{agents.length} agents · chain 5031</span>
            </div>

            {phase === "plan" && (
              <div className="plan-list">
                {agents.map(a => (
                  <div key={a.id} className="plan-row">
                    <span className="dot pulse" />
                    <div>
                      <div className="agent-name">● {a.name} <span style={{ color: "var(--ink-muted)" }}>// {a.desc}</span></div>
                      <div className="agent-tool">{a.tool}</div>
                    </div>
                    <div>
                      <div className="agent-desc">{a.desc}</div>
                      <div className="agent-sub">{a.sub}</div>
                    </div>
                    <div className="agent-meta">
                      <span>cost: <b>{a.cost.toFixed(2)}</b> STT</span>
                      <span className="eta">eta: ~ {a.eta}s</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {phase !== "plan" && (
              <div className="plan-list">
                {agents.map((a, i) => (
                  <div key={a.id} className="runtime-row">
                    <span className={"dot " + (statuses[i] === "done" ? "dot--lime" : "pulse")} />
                    <div>
                      <div className="agent-name">
                        {a.name}
                        <span style={{ color: "var(--ink-muted)", marginLeft: 10 }}>
                          // {a.desc}
                        </span>
                      </div>
                      <div className="agent-log">{a.log[logIdx[i]]}</div>
                      <div className="progress"><i style={{ transform: `scaleX(${progress[i]})` }} /></div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                      <span className={"status-pill" + (statuses[i] === "done" ? " done" : "")}>{statuses[i]}</span>
                      <span style={{ color: "var(--ink-muted)", fontSize: 11 }}>
                        {statuses[i] === "done" ? <a href="#dossier" style={{ color: "var(--violet)" }}>view receipt ↗</a> : <>cost: {a.cost.toFixed(2)} STT</>}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {phase === "done" && (
              <div style={{ marginTop: 18 }}>
                <a href="#dossier" className="dossier-chip">
                  <span className="dot dot--violet pulse" />
                  &gt; dossier ready · 0x7f3a…d2c1 · open below ↓
                </a>
              </div>
            )}
          </div>

          {/* DISPATCH BAR */}
          <div className="dispatch-bar">
            <div className="ledger">
              <div className="ledger-row"><span className="k">agents</span><span className="v">{subtotal.toFixed(2)} STT</span></div>
              <div className="ledger-row">
                <span className="k">service +{founderMode ? "0" : "50"}%</span>
                <span className="v">{effectiveService.toFixed(2)} STT</span>
              </div>
              {founderMode && (
                <div className="ledger-row"><span className="k" style={{ color: "var(--violet)" }}>&gt; founder mode</span><span className="v" style={{ color: "var(--violet)" }}>active</span></div>
              )}
              <div className="ledger-row sep" />
              <div className="ledger-row total">
                <span className="k">total</span>
                <span className="v">{effectiveTotal.toFixed(2)} STT &nbsp;≈ ${(effectiveTotal * STT_USD).toFixed(2)}</span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
              {phase === "done" && (
                <button className="btn--ghost" onClick={reset}>&gt; reset</button>
              )}
              <button
                className="dispatch-btn"
                onClick={dispatch}
                disabled={phase === "running"}
                style={phase === "running" ? { opacity: 0.5, cursor: "wait" } : null}
              >
                <span>&gt;</span> {phase === "running" ? "dispatching…" : phase === "done" ? "dispatch again" : "dispatch swarm"}
                {phase === "running" && <span className="spinner" style={{ marginLeft: 8 }} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

window.ConsoleSection = Console;
