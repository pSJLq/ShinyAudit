/* app.jsx — {s}hinyAudit chat investigator main app */

const { useState, useEffect, useRef, useMemo, useCallback } = React;

/* ============================================================
   BRAND MARK COMPONENT — the {s} tile, used in nav + avatars
   ============================================================ */
function SMark({ size = 30 }) {
  const sSize = size * 0.62;
  return (
    <div className="brand-mark" style={{ width: size, height: size, position: "relative" }}>
      <svg viewBox="0 0 89.666 68" xmlns="http://www.w3.org/2000/svg" fill="currentColor"
           style={{ width: "82%", height: "82%" }} preserveAspectRatio="xMidYMid meet">
        <path d="M 0 31.481 L 3.148 31.481 C 4.04 31.481 4.827 31.298 5.509 30.931 C 6.191 30.511 6.742 29.986 7.162 29.356 C 7.634 28.674 7.975 27.94 8.185 27.153 C 8.448 26.313 8.579 25.474 8.579 24.634 L 8.579 11.963 C 8.579 10.022 8.762 8.316 9.13 6.847 C 9.549 5.378 10.231 4.145 11.176 3.148 C 12.12 2.099 13.38 1.312 14.954 0.787 C 16.58 0.262 18.6 0 21.014 0 L 27.389 0 L 27.389 5.116 L 20.699 5.116 C 18.495 5.116 16.921 5.614 15.977 6.611 C 15.085 7.608 14.639 9.418 14.639 12.042 L 14.639 22.903 C 14.639 26.418 14.114 29.015 13.065 30.694 C 12.015 32.321 10.809 33.423 9.444 34 C 10.809 34.63 12.015 35.81 13.065 37.542 C 14.114 39.273 14.639 41.792 14.639 45.097 L 14.639 55.958 C 14.639 58.582 15.111 60.392 16.056 61.389 C 17 62.386 18.574 62.884 20.778 62.884 L 27.389 62.884 L 27.389 68 L 21.014 68 C 18.6 68 16.58 67.738 14.954 67.213 C 13.38 66.688 12.12 65.901 11.176 64.852 C 10.231 63.855 9.549 62.622 9.13 61.153 C 8.762 59.684 8.579 57.978 8.579 56.037 L 8.579 43.366 C 8.579 42.579 8.448 41.792 8.185 41.005 C 7.975 40.165 7.634 39.431 7.162 38.801 C 6.742 38.119 6.191 37.568 5.509 37.148 C 4.88 36.728 4.119 36.519 3.227 36.519 L 0 36.519 L 0 31.481 Z" />
        <path d="M 89.666 36.519 L 86.518 36.519 C 85.626 36.519 84.839 36.728 84.156 37.148 C 83.527 37.515 82.976 38.04 82.504 38.722 C 82.084 39.352 81.743 40.086 81.481 40.926 C 81.271 41.713 81.166 42.526 81.166 43.366 L 81.166 56.037 C 81.166 57.978 80.956 59.684 80.536 61.153 C 80.169 62.622 79.487 63.855 78.49 64.852 C 77.545 65.901 76.26 66.688 74.633 67.213 C 73.059 67.738 71.065 68 68.652 68 L 62.277 68 L 62.277 62.884 L 68.967 62.884 C 71.17 62.884 72.718 62.386 73.61 61.389 C 74.555 60.392 75.027 58.582 75.027 55.958 L 75.027 45.097 C 75.027 41.582 75.552 39.011 76.601 37.384 C 77.65 35.705 78.857 34.577 80.221 34 C 78.857 33.37 77.65 32.19 76.601 30.458 C 75.552 28.727 75.027 26.208 75.027 22.903 L 75.027 12.042 C 75.027 9.418 74.555 7.608 73.61 6.611 C 72.666 5.614 71.092 5.116 68.888 5.116 L 62.277 5.116 L 62.277 0 L 62.277 0 L 68.652 0 C 71.065 0 73.059 0.262 74.633 0.787 C 76.26 1.312 77.545 2.099 78.49 3.148 C 79.487 4.145 80.169 5.378 80.536 6.847 C 80.956 8.316 81.166 10.022 81.166 11.963 L 81.166 24.634 C 81.166 25.421 81.271 26.235 81.481 27.074 C 81.69 27.861 82.005 28.596 82.425 29.278 C 82.897 29.907 83.448 30.432 84.078 30.852 C 84.76 31.272 85.547 31.481 86.439 31.481 L 89.666 31.481 L 89.666 36.519 Z" />
      </svg>
      <span aria-hidden="true" style={{
        position: "absolute",
        left: "50%", top: "50%",
        transform: "translate(-50%, -52%)",
        fontFamily: "var(--mono)",
        fontWeight: 600,
        fontSize: sSize + "px",
        lineHeight: 1,
        letterSpacing: "-0.06em",
        color: "currentColor",
        pointerEvents: "none",
      }}>s</span>
    </div>
  );
}

/* ============================================================
   TOP NAV
   ============================================================ */
function TopNav({ session }) {
  return (
    <nav className="topnav">
      <div className="topnav-left">
        <div className="brand">
          <SMark size={32} />
          <span className="brand-name">hinyAudit</span>
          <span className="brand-tag">// on-chain investigator</span>
        </div>
        <div className="topnav-links">
          <a href="#">manifesto</a>
          <a href="#" className="active">chat</a>
          <a href="#">swarm</a>
          <a href="#">capabilities</a>
          <a href="#">cost</a>
          <a href="#">docs</a>
        </div>
      </div>
      <div className="topnav-right">
        <span className="network-pill"><span className="dot"></span> somnia testnet</span>
        <button className="wallet-pill">
          <span>0x7c4a…91bd</span>
          <span style={{ color: "var(--fg-faint)" }}>·</span>
          <span style={{ color: "var(--fg-mute)" }}>connected</span>
        </button>
      </div>
    </nav>
  );
}

/* ============================================================
   SESSION HEADER + CREDIT STRIP
   ============================================================ */
function SessionStrip({ session, onNew }) {
  const pct = Math.min(100, (session.credit / 30) * 100);
  const remainingTurns = Math.floor(session.credit / session.lastReply);
  return (
    <div className="session-strip">
      <div className="session-row-1">
        <div className="session-id">
          <span className="pre">&gt;&nbsp;session</span>
          <span className="id">{session.id}</span>
          <span className="meta">// {session.turns} turn{session.turns === 1 ? "" : "s"} · started {session.startedAt}</span>
        </div>
        <div className="session-actions">
          <button className="btn-mini" onClick={onNew}><span className="key">[+]</span> new session</button>
          <button className="btn-mini"><span className="key">[↓]</span> download .md</button>
          <button className="btn-mini"><span className="key">[↗]</span> share read-only</button>
        </div>
      </div>
      <div className="credit-bar">
        <span className="label">credit</span>
        <span className="value"><strong>{session.credit.toFixed(3)}</strong> STT</span>
        <div className="meter"><div className="meter-fill" style={{ width: `${pct}%` }} /></div>
        <span className="topup">+ top up</span>
        <span className="sep">|</span>
        <span className="label">last reply</span>
        <span className="value">{session.lastReply.toFixed(2)} STT</span>
        <span className="sep">|</span>
        <span className="label">session total</span>
        <span className="value">{session.sessionTotal.toFixed(3)} STT</span>
        <span className="sep">|</span>
        <span className="label">est ≈ {remainingTurns} more turns</span>
      </div>
    </div>
  );
}

/* ============================================================
   AGENT STRIP — live timeline inside swarm replies
   ============================================================ */
function AgentStrip({ agents, streaming, duration }) {
  const [collapsed, setCollapsed] = useState(false);
  const allDone = agents.every(a => a.status === "done");

  // auto-collapse once done after a beat
  useEffect(() => {
    if (allDone && !streaming) {
      const t = setTimeout(() => setCollapsed(true), 1200);
      return () => clearTimeout(t);
    }
  }, [allDone, streaming]);

  if (collapsed && allDone && !streaming) {
    return (
      <div className="agent-strip collapsed" onClick={() => setCollapsed(false)}>
        <span>// {agents.length} agents · {duration}s · receipts <span className="check">✓</span></span>
        <span style={{ marginLeft: "auto", color: "var(--fg-faint)" }}>[ expand ]</span>
      </div>
    );
  }

  return (
    <div className="agent-strip">
      {agents.map((a, idx) => (
        <div key={a.id || a.name + idx} className="agent-row">
          <div className="agent-row-head">
            <span className={"agent-dot " + a.status}></span>
            <span className="agent-row-name">{a.name}</span>
            <span className={"agent-row-status " + a.status}>{a.status}</span>
            <span style={{ color: "var(--fg-faint)", fontSize: 11 }}>// {a.meta}</span>
          </div>
          {a.logs.map((l, li) => (
            <div key={li} className="agent-row-log">
              <span className="arrow">▸</span>
              {l.txt}
              {l.receipt && <a className="receipt" href={`https://agents.testnet.somnia.network/receipts/${l.receipt}`}>receipt {l.receipt} ↗</a>}
            </div>
          ))}
        </div>
      ))}
      {allDone && !streaming && (
        <div style={{ alignSelf: "flex-end", marginTop: 4 }}>
          <button className="btn-mini" onClick={() => setCollapsed(true)}>[ collapse ]</button>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   USER MESSAGE
   ============================================================ */
function UserMessage({ msg }) {
  return (
    <div className="msg-user">
      <div className="bubble">{msg.text}</div>
      <div className="chips">
        {msg.target && (
          <span className="chip"><span className="k">target ::</span> {msg.target.kind} {window.DEMO_DATA.SHORT_ADDR(msg.target.addr)}</span>
        )}
        {msg.qtype && (
          <span className="chip qtype"><span className="k">type ::</span> {msg.qtype}</span>
        )}
        {msg.costEst != null && (
          <span className="chip"><span className="k">est ::</span> {msg.costEst.toFixed(2)} STT</span>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   SWARM REPLY
   ============================================================ */
function SwarmReply({ msg }) {
  const isStreaming = msg.status === "streaming" || msg.status === "planning";
  const [view, setView] = useState(msg.view || "user");
  return (
    <div className="msg-swarm">
      <div className="swarm-avatar"><SMark size={44} /></div>
      <div className="swarm-card">
        {/* header */}
        <div className="swarm-header">
          <div className="swarm-title">
            <span style={{ color: "var(--fg-mute)" }}>&gt;</span>
            <span className="kind">{msg.title.kind}</span>
            <span className="target">· {msg.title.target}</span>
            {msg.sealed && <span className="sealed">sealed · immutable</span>}
            {isStreaming && <span className="sealed" style={{ color: "var(--blue)", borderColor: "rgba(110,110,237,0.5)" }}>streaming · live</span>}
          </div>
          <div className="swarm-meta">
            {msg.costTotal != null ? (
              <span className="cost" title={`agents ${msg.agentsCost} STT + service ${msg.serviceCost} STT`}>
                {msg.agents.length} agents · {msg.costTotal.toFixed(3)} STT
              </span>
            ) : (
              <span className="cost" style={{ color: "var(--fg-faint)" }}>cost pending…</span>
            )}
            <span className="receipts">view all receipts ↗</span>
          </div>
        </div>

        {/* planning shimmer (only when fully planning) */}
        {msg.status === "planning" && (
          <div style={{ padding: "12px 0", color: "var(--fg-mute)", fontSize: 13 }}>
            &gt; planning… selecting agents
            <span className="cursor" style={{ marginLeft: 4 }} />
          </div>
        )}

        {/* agent strip */}
        {msg.agents && msg.agents.length > 0 && (
          <AgentStrip agents={msg.agents} streaming={isStreaming} duration={msg.duration} />
        )}

        {/* verdict (with typewriter effect when streaming-in) */}
        {msg.verdict && <Verdict verdict={msg.verdict} />}

        {/* blocks */}
        {msg.blocks && msg.blocks.map((b, idx) => (
          <BlockRenderer key={idx} block={b} view={view} onSetView={setView} />
        ))}

        {/* citations */}
        {msg.citations && msg.citations.length > 0 && (
          <Citations citations={msg.citations} />
        )}

        {/* streaming spinner if still going */}
        {isStreaming && msg.verdict == null && (
          <div style={{ marginTop: 18, fontSize: 12, color: "var(--fg-faint)" }}>
            &gt; verdict pending… agents executing on Somnia
            <span className="cursor" style={{ marginLeft: 4 }} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   EMPTY STATE
   ============================================================ */
function EmptyState({ onPick }) {
  const { QUICKSTART_TILES } = window.DEMO_DATA;
  return (
    <div className="empty">
      <div className="empty-mark"><SMark size={88} /></div>
      <div className="empty-title">ask the <span className="accent">swarm</span> anything that lives on Somnia.</div>
      <div className="empty-sub">
        &gt; investigations are powered by real on-chain agents. each reply ships with verifiable receipts you can audit, and a flat cost in STT.
      </div>
      <div className="quickstart">
        {QUICKSTART_TILES.map(t => (
          <button key={t.cmd} className="quickstart-tile" onClick={() => onPick(t.ex || t.cmd)}>
            <span className="icon">{t.icon}  {t.cmd}</span>
            <span className="name">{t.name}</span>
            <span className="ex">{t.hint}</span>
            <span className="ex" style={{ color: "var(--fg-mute)", marginTop: 4 }}>&gt; {t.ex}</span>
          </button>
        ))}
      </div>
      <div className="quickstart-foot">
        // your first question costs <span className="v">≈ 1.80 STT</span> · escrow credit shown above · receipts visible at <span className="v">agents.testnet.somnia.network</span>
      </div>
    </div>
  );
}

/* ============================================================
   COMPOSER
   ============================================================ */
function Composer({ disabled, onSend, session }) {
  const [text, setText] = useState("");
  const taRef = useRef(null);
  const { SLASH_COMMANDS } = window.DEMO_DATA;

  // auto-resize
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(220, ta.scrollHeight) + "px";
  }, [text]);

  // slash menu
  const showSlash = text.startsWith("/") && !text.includes(" ");
  const slashFiltered = useMemo(() => {
    if (!showSlash) return [];
    const q = text.toLowerCase();
    return SLASH_COMMANDS.filter(c => c.cmd.startsWith(q));
  }, [text, showSlash]);

  // target chip detection
  const target = useMemo(() => {
    const addrMatch = text.match(/0x[a-fA-F0-9]{6,}/);
    if (!addrMatch) return null;
    const a = addrMatch[0];
    const lower = text.toLowerCase();
    let kind = "address";
    if (lower.includes("/audit")) kind = "contract";
    else if (lower.includes("/profile") || lower.includes("/trace")) kind = "wallet";
    else if (lower.includes("/xray") || lower.includes("token")) kind = "token";
    else if (a.length === 66) kind = "tx";
    return { kind, addr: a };
  }, [text]);

  const qtype = useMemo(() => {
    if (text.startsWith("/audit"))   return "audit";
    if (text.startsWith("/profile")) return "profile";
    if (text.startsWith("/trace"))   return "trace";
    if (text.startsWith("/xray"))    return "x-ray";
    if (text.startsWith("/watch"))   return "watch";
    if (text.startsWith("/stealth")) return "stealth";
    return null;
  }, [text]);

  // cost estimate
  const costEst = useMemo(() => {
    const t = text.trim();
    if (!t) return null;
    let base = 0.6;
    if (qtype === "audit")   base = 1.85;
    if (qtype === "trace")   base = 2.10;
    if (qtype === "profile") base = 1.51;
    if (qtype === "xray")    base = 1.32;
    if (qtype === "stealth") base = 2.40;
    if (qtype === "watch")   base = 0.40;
    return base + (t.length / 600);
  }, [text, qtype]);

  const canSend = text.trim().length > 0 && !disabled && (!costEst || costEst < session.credit);

  const handleSend = () => {
    if (!canSend) return;
    onSend({ text: text.trim(), target, qtype, costEst });
    setText("");
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const pickSlash = (cmd) => {
    setText(cmd + " ");
    setTimeout(() => taRef.current?.focus(), 0);
  };

  return (
    <div className="composer-wrap">
      <div className="composer">
        {showSlash && slashFiltered.length > 0 && (
          <div className="slash-menu">
            {slashFiltered.map((s, idx) => (
              <div key={s.cmd} className="slash-item" onClick={() => pickSlash(s.cmd)}>
                <span className="cmd">{s.cmd}</span>
                <span className="desc">{s.desc}</span>
                <span className="ex">&gt; {s.cmd} {s.ex}</span>
              </div>
            ))}
          </div>
        )}

        {(target || qtype) && (
          <div className="composer-chips">
            {target && (
              <span className="target-chip">
                {target.kind} :: {window.DEMO_DATA.SHORT_ADDR(target.addr)}
                <span className="x" title="auto-detected target">·</span>
              </span>
            )}
            {qtype && (
              <span className="target-chip" style={{ background: "rgba(110,110,237,0.10)", borderColor: "rgba(110,110,237,0.4)" }}>
                type :: {qtype}
              </span>
            )}
            <span style={{ marginLeft: "auto" }}>// auto-detected from prompt</span>
          </div>
        )}

        <div className="composer-main">
          <textarea
            ref={taRef}
            className="composer-textarea"
            placeholder={disabled ? "swarm executing… composer locked" : "> ask the swarm…   use / for commands · paste an address to attach a target"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKey}
            disabled={disabled}
          />
          <div className="composer-actions">
            <div className="composer-cost">
              {costEst != null ? (
                <>
                  ≈ <span className="v">{costEst.toFixed(2)} STT</span><br/>
                  for this question
                </>
              ) : (
                <span style={{ color: "var(--fg-faint)" }}>// no cost yet</span>
              )}
            </div>
            <button className="send-btn" onClick={handleSend} disabled={!canSend} title="send (⏎)">↵</button>
          </div>
        </div>
      </div>
      <div className="composer-hint">
        <span>
          <span className="kbd">/</span> commands &nbsp;
          <span className="kbd">⏎</span> send &nbsp;
          <span className="kbd">⇧⏎</span> newline &nbsp;
          <span className="kbd">⌘K</span> new session
        </span>
        <span>
          // sessions are local to wallet 0x7c4a…91bd · sealed receipts on agents.testnet.somnia.network
        </span>
      </div>
    </div>
  );
}

/* ============================================================
   STREAMING SIMULATION  — replays the partial reply to "done"
   then optionally simulates a fresh user follow-up that streams in.
   ============================================================ */

function useDemoLoop({ messages, setMessages, setSession, session }) {
  // Promote the initial streaming message (M4) to done after a delay so the user sees motion on load.
  useEffect(() => {
    let cancelled = false;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "swarm" || last.status !== "streaming") return;

    // step 1: after 1.5s update hop 2 in flow-tracer
    const t1 = setTimeout(() => {
      if (cancelled) return;
      setMessages(prev => {
        const m = [...prev];
        const last = { ...m[m.length - 1] };
        last.agents = last.agents.map((a, i) => {
          if (i === 1) return {
            ...a,
            meta: "hop 2 → 7 destinations · classifying terminals",
            logs: [
              { txt: "hop 1 · 12 outgoing · 4 unique destinations",   receipt: "0x88ee…2211" },
              { txt: "hop 2 · 9 paths · 7 destinations · ✓",          receipt: "0xaa42…91ff" },
              { txt: "hop 3 · walking final ring…",                    receipt: null },
            ],
          };
          return a;
        });
        m[m.length - 1] = last;
        return m;
      });
    }, 1700);

    // step 2: after 3.0s flow-tracer done, classifier running
    const t2 = setTimeout(() => {
      if (cancelled) return;
      setMessages(prev => {
        const m = [...prev];
        const last = { ...m[m.length - 1] };
        last.agents = last.agents.map((a, i) => {
          if (i === 1) return {
            ...a, status: "done",
            meta: "walked 3 hops · 14 terminal addresses",
            logs: [
              { txt: "hop 1 · 12 outgoing · 4 unique destinations",   receipt: "0x88ee…2211" },
              { txt: "hop 2 · 9 paths · 7 destinations · ✓",          receipt: "0xaa42…91ff" },
              { txt: "hop 3 · 14 terminals classified",               receipt: "0x44dd…7c0b" },
            ],
          };
          if (i === 2) return { ...a, status: "running",
            meta: "tagging counterparties via blockscout labels",
            logs: [{ txt: "matching 14 / 14 terminals…", receipt: null }] };
          return a;
        });
        m[m.length - 1] = last;
        return m;
      });
    }, 3200);

    // step 3: after 4.7s classifier done, synthesizer running
    const t3 = setTimeout(() => {
      if (cancelled) return;
      setMessages(prev => {
        const m = [...prev];
        const last = { ...m[m.length - 1] };
        last.agents = last.agents.map((a, i) => {
          if (i === 2) return {
            ...a, status: "done",
            meta: "classified 14 terminals · 100% labeled",
            logs: [{ txt: "3 cex · 2 dex · 1 bridge · 8 held",         receipt: "0x9920…ffbb" }],
          };
          if (i === 3) return {
            ...a, status: "running",
            meta: "claude-sonnet · synthesizing verdict",
            logs: [{ txt: "ranking flows · drafting headline…", receipt: null }],
          };
          return a;
        });
        m[m.length - 1] = last;
        return m;
      });
    }, 4700);

    // step 4: after 6.2s — DONE, swap in completed payload
    const t4 = setTimeout(() => {
      if (cancelled) return;
      setMessages(prev => {
        const m = [...prev];
        m[m.length - 1] = window.DEMO_DATA.M4_SWARM_DONE;
        return m;
      });
      setSession(s => ({
        ...s,
        credit: 24.380 - 2.118,
        sessionTotal: 6.124 + 2.118,
        lastReply: 2.118,
        turns: 3,
      }));
    }, 6200);

    return () => {
      cancelled = true;
      [t1, t2, t3, t4].forEach(clearTimeout);
    };
  }, []); // run once
}

/* simulate a new follow-up reply streaming in after the user sends */
function simulateFollowup(userMsg, setMessages, setSession) {
  const baseReply = {
    id: "s_" + Date.now(),
    role: "swarm",
    status: "planning",
    title: { kind: userMsg.qtype || "free-form", target: userMsg.target ? window.DEMO_DATA.SHORT_ADDR(userMsg.target.addr) : "interpretation" },
    costTotal: null, agentsCost: null, serviceCost: null,
    sealed: false, duration: null,
    agents: [], verdict: null, blocks: [], citations: [],
  };

  // initial planning placeholder
  setMessages(prev => [...prev, baseReply]);

  const planAgents = [
    { name: "scout-fetch",     meta: "queued",                                       status: "queued", logs: [] },
    { name: "classifier",      meta: "queued",                                       status: "queued", logs: [] },
    { name: "auditor-llm",     meta: "queued",                                       status: "queued", logs: [] },
    { name: "synthesizer",     meta: "queued",                                       status: "queued", logs: [] },
  ];

  // reveal planned agents
  setTimeout(() => {
    setMessages(prev => {
      const m = [...prev];
      m[m.length - 1] = { ...m[m.length - 1], status: "streaming", agents: planAgents };
      return m;
    });
  }, 600);

  // step 1 — scout running
  setTimeout(() => {
    setMessages(prev => {
      const m = [...prev];
      const last = { ...m[m.length - 1] };
      last.agents = last.agents.map((a, i) => i === 0
        ? { ...a, status: "running", meta: "fetching tx history…", logs: [{ txt: "GET blockscout · 1k page", receipt: null }] }
        : a);
      m[m.length - 1] = last;
      return m;
    });
  }, 1400);

  // step 2 — scout done, classifier running
  setTimeout(() => {
    setMessages(prev => {
      const m = [...prev];
      const last = { ...m[m.length - 1] };
      last.agents = last.agents.map((a, i) => {
        if (i === 0) return { ...a, status: "done", meta: "pulled 412 txs · 41 days", logs: [{ txt: "412 txs · consensus 7/7 ✓", receipt: "0x55aa…ddee" }] };
        if (i === 1) return { ...a, status: "running", meta: "classifying 32 counterparties…", logs: [] };
        return a;
      });
      m[m.length - 1] = last;
      return m;
    });
  }, 2600);

  // step 3 — classifier done, auditor running
  setTimeout(() => {
    setMessages(prev => {
      const m = [...prev];
      const last = { ...m[m.length - 1] };
      last.agents = last.agents.map((a, i) => {
        if (i === 1) return { ...a, status: "done", meta: "labelled 32 unique counterparties", logs: [{ txt: "5 dex · 2 cex · 3 bridges · 22 eoa", receipt: "0x66bb…ccff" }] };
        if (i === 2) return { ...a, status: "running", meta: "claude-sonnet · behavioural fingerprint", logs: [{ txt: "synthesising 1k tokens…", receipt: null }] };
        return a;
      });
      m[m.length - 1] = last;
      return m;
    });
  }, 3900);

  // step 4 — auditor done, synth running
  setTimeout(() => {
    setMessages(prev => {
      const m = [...prev];
      const last = { ...m[m.length - 1] };
      last.agents = last.agents.map((a, i) => {
        if (i === 2) return { ...a, status: "done", meta: "behavioural fingerprint · 1k tokens", logs: [{ txt: "DeFi-power-user · MEV-adjacent · whale-ish", receipt: "0x77cc…bbaa" }] };
        if (i === 3) return { ...a, status: "running", meta: "ranking and sealing…", logs: [] };
        return a;
      });
      m[m.length - 1] = last;
      return m;
    });
  }, 5200);

  // step 5 — swap in done payload
  setTimeout(() => {
    setMessages(prev => {
      const m = [...prev];
      m[m.length - 1] = { ...window.DEMO_DATA.FOLLOWUP_RESPONSE, id: m[m.length - 1].id };
      return m;
    });
    setSession(s => {
      const cost = window.DEMO_DATA.FOLLOWUP_RESPONSE.costTotal;
      return {
        ...s,
        credit: s.credit - cost,
        sessionTotal: s.sessionTotal + cost,
        lastReply: cost,
        turns: s.turns + 1,
      };
    });
  }, 6800);
}

/* ============================================================
   APP
   ============================================================ */
function App() {
  const D = window.DEMO_DATA;
  const [session, setSession] = useState(D.DEMO_SESSION);
  const [messages, setMessages] = useState(D.initialMessages);
  const [isStreaming, setIsStreaming] = useState(true);
  const [showEmpty, setShowEmpty] = useState(false);
  const bottomRef = useRef(null);

  // run the demo loop on mount
  useDemoLoop({ messages, setMessages, setSession, session });

  // detect when streaming finishes
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last) { setIsStreaming(false); return; }
    if (last.role === "swarm" && (last.status === "streaming" || last.status === "planning")) {
      setIsStreaming(true);
    } else {
      setIsStreaming(false);
    }
  }, [messages]);

  // auto-scroll on new message / streaming update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const handleSend = useCallback((userMsg) => {
    const m = {
      id: "u_" + Date.now(),
      role: "user",
      text: userMsg.text,
      target: userMsg.target,
      qtype: userMsg.qtype,
      costEst: userMsg.costEst,
    };
    setMessages(prev => [...prev, m]);
    setShowEmpty(false);
    setTimeout(() => simulateFollowup(userMsg, setMessages, setSession), 200);
  }, []);

  const handleNew = () => {
    setMessages([]);
    setShowEmpty(true);
    setSession({ ...D.DEMO_SESSION, credit: 30.0, sessionTotal: 0, lastReply: 0, turns: 0, id: "dossier-#" + String(242 + Math.floor(Math.random() * 99)).padStart(4, "0") });
  };

  const empty = showEmpty || messages.length === 0;

  return (
    <div className="shell">
      {window.VideoBg && <window.VideoBg />}
      <TopNav session={session} />
      <SessionStrip session={session} onNew={handleNew} />
      <div className="chat-body">
        {empty ? (
          <EmptyState onPick={(ex) => {
            setShowEmpty(false);
            // pre-fill composer would be nicer; for now, send directly so the user sees motion
            handleSend({ text: ex, target: null, qtype: ex.startsWith("/") ? ex.slice(1).split(" ")[0] : null, costEst: 1.8 });
          }} />
        ) : (
          <div className="messages">
            {messages.map(m => m.role === "user"
              ? <UserMessage key={m.id} msg={m} />
              : <SwarmReply key={m.id} msg={m} />)}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
      <Composer disabled={isStreaming} onSend={handleSend} session={session} />
      {window.ShinyTweaks && <window.ShinyTweaks />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
