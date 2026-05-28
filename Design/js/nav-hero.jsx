/* global React, PixelGrid */
const { useState, useEffect, useRef } = React;

/* --------- NAV --------- */
function Nav() {
  const [connected, setConnected] = useState(false);
  return (
    <nav className="nav">
      <div className="nav-inner">
        <a href="#top" className="nav-brand">
          <span className="brand-mark">{"{s}"}</span><span className="brand-word">hinyAudit</span>
        </a>
        <div className="nav-links">
          <a href="#console">&gt; console</a>
          <a href="#swarm">&gt; swarm</a>
          <a href="#docs">&gt; docs</a>
          <a href="#receipts">&gt; receipts</a>
        </div>
        <div className="nav-right">
          {!connected ? (
            <button className="btn btn--sm" onClick={() => setConnected(true)}>
              <span>&gt;</span> connect wallet
            </button>
          ) : (
            <div className="wallet-pill">
              <span className="dot pulse" />
              <span className="num">0xab…cd</span>
              <span className="sep">·</span>
              <span className="num" style={{ color: "var(--blue)" }}>12.4 STT</span>
            </div>
          )}
        </div>
      </div>
      <div className="hairline" />
    </nav>
  );
}

/* --------- HERO --------- */
function Hero() {
  const lines = ["> investigate", "  any wallet,", "  any contract,", "  any flow."];
  const [typed, setTyped] = useState(["", "", "", ""]);
  const [doneTyping, setDoneTyping] = useState(false);

  useEffect(() => {
    let li = 0, ci = 0;
    const tick = () => {
      if (li >= lines.length) { setDoneTyping(true); return; }
      const target = lines[li];
      if (ci <= target.length) {
        setTyped(prev => {
          const next = [...prev];
          next[li] = target.slice(0, ci);
          return next;
        });
        ci++;
        setTimeout(tick, 32);
      } else {
        li++; ci = 0;
        setTimeout(tick, 140);
      }
    };
    tick();
  }, []);

  const scrollToConsole = (e) => {
    e.preventDefault();
    document.getElementById("console")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section className="hero" id="top">
      <div className="hero-bg">
        <PixelGrid density={0.16} violetRatio={0.62} opacity={1} />
        <div className="hero-glow" />
      </div>
      <div className="container hero-inner">
        <div className="hero-content">
          <div className="chip" style={{ marginBottom: 28 }}>
            <span className="dot" />
            <span>[ s ] · agentic L1 · live on somnia mainnet</span>
          </div>

          <h1 className="hero-title">
            {typed.map((t, i) => (
              <span key={i} className="hero-line">
                {i === 0 ? <span className="prompt">&gt;</span> : <span className="prompt invisible">&gt;</span>}
                <span className="hero-text">{t.replace(/^>\s?/, "")}</span>
                {!doneTyping && i === typed.findIndex((_, k) => typed[k].length < lines[k].length) && (
                  <span className="caret" />
                )}
                {doneTyping && i === lines.length - 1 && <span className="caret" />}
              </span>
            ))}
          </h1>

          <p className="hero-sub">
            a swarm of on-chain agents reads the somnia ledger for you —
            forensic depth, autonomous, verifiable.
          </p>

          <div className="hero-cta">
            <button className="btn" onClick={scrollToConsole}>
              <span>&gt;</span> dispatch a swarm
            </button>
            <a href="#dossier" className="btn--ghost">read the dossier</a>
          </div>

          <Ticker />
        </div>

        <AmbientPanel />
      </div>
    </section>
  );
}

function Ticker() {
  const [vals, setVals] = useState({ ...window.MOCK.ticker });
  useEffect(() => {
    const id = setInterval(() => {
      setVals(v => ({
        investigations: v.investigations + (Math.random() < 0.7 ? 1 : 0),
        contracts: v.contracts + (Math.random() < 0.5 ? 1 : 0),
        spent: v.spent + Math.floor(Math.random() * 9),
      }));
    }, 1400);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="ticker">
      <span className="dot dot--lime pulse" style={{ animationDuration: "2s" }} />
      <span>live</span>
      <span className="sep">·</span>
      <span className="num blue">{vals.investigations.toLocaleString()}</span> investigations
      <span className="sep">·</span>
      <span className="num blue">{vals.contracts.toLocaleString()}</span> contracts profiled
      <span className="sep">·</span>
      <span className="num blue">{vals.spent.toLocaleString()}</span> STT spent
    </div>
  );
}

/* --------- AMBIENT SWARM PANEL --------- */
function AmbientPanel() {
  const agents = window.MOCK.ambientAgents;
  const feed = window.MOCK.ambientFeed;
  const [tickIdx, setTickIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTickIdx(i => i + 1), 1800);
    return () => clearInterval(id);
  }, []);
  const visible = [];
  for (let i = 0; i < 6; i++) {
    visible.push(feed[(tickIdx + i) % feed.length]);
  }
  return (
    <aside className="ambient corners">
      <span className="corner-tl" /><span className="corner-br" />
      <header className="ambient-h">
        <span className="prompt">&gt;</span> swarm.status
        <span className="ambient-h-meta">chain 5031</span>
      </header>
      <div className="ambient-agents">
        {agents.map(a => (
          <div className="ambient-row" key={a.id}>
            <span className="dot pulse" />
            <span className="ambient-name">{a.label}</span>
            <span className="ambient-meta">online</span>
            <span className="ambient-q">{a.meta}</span>
          </div>
        ))}
      </div>
      <div className="hairline--blue hairline" />
      <div className="ambient-feed">
        <div className="ambient-feed-h">activity</div>
        {visible.map((line, i) => (
          <div key={tickIdx + "-" + i} className="ambient-feed-line" style={{ opacity: 1 - i * 0.12 }}>
            <span className="ambient-feed-t">{String(120 - i * 7).padStart(3, "0")}s</span>
            <span>{line}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

window.Nav = Nav;
window.Hero = Hero;
