"use client";

import { useEffect, useState } from "react";
import { PixelGrid } from "./PixelGrid";
import { MOCK } from "@/lib/mock";

const LINES = ["> investigate", "  any wallet,", "  any contract,", "  any flow."];

export function Hero() {
  const [typed, setTyped] = useState<string[]>(["", "", "", ""]);
  const [doneTyping, setDoneTyping] = useState(false);

  useEffect(() => {
    let li = 0, ci = 0;
    let stop = false;
    const tick = () => {
      if (stop) return;
      if (li >= LINES.length) { setDoneTyping(true); return; }
      const target = LINES[li];
      if (ci <= target.length) {
        setTyped((prev) => {
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
    return () => { stop = true; };
  }, []);

  const goToChat = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // anchor handles navigation natively; preserve hash so Nav can route too
    void e;
  };

  return (
    <section className="hero">
      <div className="hero-bg">
        <PixelGrid density={0.11} violetRatio={0.62} opacity={1} />
        <div className="hero-glow" />
      </div>

      <div className="container-x hero-inner">
        <div className="hero-content">
          <div className="chip" style={{ marginBottom: 28 }}>
            <span className="dot" />
            <span>[ s ] · agentic L1 · live on somnia testnet</span>
          </div>

          <h1 className="hero-title">
            {typed.map((t, i) => {
              const activeIdx = typed.findIndex((_, k) => typed[k].length < LINES[k].length);
              return (
                <span key={i} className="hero-line">
                  {i === 0 ? <span className="prompt">&gt;</span> : <span className="prompt invisible">&gt;</span>}
                  <span className="hero-text">{t.replace(/^>\s?/, "")}</span>
                  {!doneTyping && i === activeIdx && <span className="caret" />}
                  {doneTyping && i === LINES.length - 1 && <span className="caret" />}
                </span>
              );
            })}
          </h1>

          <p className="hero-sub">
            a swarm of on-chain agents reads the somnia ledger for you — forensic depth, autonomous, verifiable.
          </p>

          <div className="hero-cta">
            <a className="btn" href="/chat" onClick={goToChat}>
              <span>&gt;</span> dispatch a swarm
            </a>
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
  const [vals, setVals] = useState<{ investigations: number; contracts: number; spent: number }>({
    investigations: MOCK.ticker.investigations,
    contracts: MOCK.ticker.contracts,
    spent: MOCK.ticker.spent
  });
  useEffect(() => {
    const id = setInterval(() => {
      setVals((v) => ({
        investigations: v.investigations + (Math.random() < 0.7 ? 1 : 0),
        contracts: v.contracts + (Math.random() < 0.5 ? 1 : 0),
        spent: v.spent + Math.floor(Math.random() * 9)
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

function AmbientPanel() {
  const [tickIdx, setTickIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTickIdx((i) => i + 1), 1800);
    return () => clearInterval(id);
  }, []);
  const visible: string[] = [];
  for (let i = 0; i < 6; i++) visible.push(MOCK.ambientFeed[(tickIdx + i) % MOCK.ambientFeed.length]);
  return (
    <aside className="ambient corners">
      <span className="corner-tl" />
      <span className="corner-br" />
      <header className="ambient-h">
        <span className="prompt">&gt;</span> swarm.status
        <span className="ambient-h-meta">chain 50312</span>
      </header>
      <div className="ambient-agents">
        {MOCK.ambientAgents.map((a) => (
          <div className="ambient-row" key={a.id}>
            <span className="dot pulse" />
            <span className="ambient-name">{a.label}</span>
            <span className="ambient-meta">online</span>
            <span className="ambient-q">{a.meta}</span>
          </div>
        ))}
      </div>
      <div className="hairline hairline--blue" />
      <div className="ambient-feed">
        <div className="ambient-feed-h">activity</div>
        {visible.map((line, i) => (
          <div key={`${tickIdx}-${i}`} className="ambient-feed-line" style={{ opacity: 1 - i * 0.12 }}>
            <span className="ambient-feed-t">{String(120 - i * 7).padStart(3, "0")}s</span>
            <span>{line}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
