"use client";

import { useEffect, useRef } from "react";

export function SwarmGraph() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const W = svg.clientWidth || 800;
    const H = 540;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const cx = W * 0.42, cy = H * 0.5;
    const intent = { x: cx, y: cy, r: 22 };

    const agentDefs = [
      { id: "scout",   label: "scout" },
      { id: "decoder", label: "decoder" },
      { id: "tracer",  label: "tracer" },
      { id: "synth",   label: "synth" },
      { id: "watcher", label: "watcher" },
      { id: "x-ray",   label: "x-ray" }
    ];
    const ringR = Math.min(W * 0.22, 170);
    const agents = agentDefs.map((a, i) => {
      const ang = -Math.PI / 2 + (i / agentDefs.length) * Math.PI * 2;
      return { ...a, x: cx + Math.cos(ang) * ringR, y: cy + Math.sin(ang) * ringR };
    });

    const gGrid = svg.querySelector(".g-grid") as SVGGElement;
    const gEdges = svg.querySelector(".g-edges") as SVGGElement;
    const gData = svg.querySelector(".g-data") as SVGGElement;
    const gAgents = svg.querySelector(".g-agents") as SVGGElement;
    const gEvidence = svg.querySelector(".g-evidence") as SVGGElement;
    const gReport = svg.querySelector(".g-report") as SVGGElement;

    gGrid.innerHTML = "";
    for (let i = 0; i <= 12; i++) {
      const x = (i / 12) * W;
      const l = document.createElementNS("http://www.w3.org/2000/svg", "line");
      l.setAttribute("x1", String(x)); l.setAttribute("x2", String(x));
      l.setAttribute("y1", "0"); l.setAttribute("y2", String(H));
      l.setAttribute("stroke", "rgba(79,139,255,0.06)");
      l.setAttribute("stroke-width", "1");
      gGrid.appendChild(l);
    }
    for (let i = 0; i <= 8; i++) {
      const y = (i / 8) * H;
      const l = document.createElementNS("http://www.w3.org/2000/svg", "line");
      l.setAttribute("y1", String(y)); l.setAttribute("y2", String(y));
      l.setAttribute("x1", "0"); l.setAttribute("x2", String(W));
      l.setAttribute("stroke", "rgba(79,139,255,0.06)");
      l.setAttribute("stroke-width", "1");
      gGrid.appendChild(l);
    }

    gAgents.innerHTML = "";
    gEdges.innerHTML = "";
    agents.forEach((a) => {
      const sz = 18;
      const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      r.setAttribute("x", String(a.x - sz / 2)); r.setAttribute("y", String(a.y - sz / 2));
      r.setAttribute("width", String(sz)); r.setAttribute("height", String(sz));
      r.setAttribute("fill", "#4F8BFF"); r.setAttribute("opacity", "0.85");
      gAgents.appendChild(r);

      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", String(a.x)); t.setAttribute("y", String(a.y + sz / 2 + 16));
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("font-family", "Geist Mono, monospace");
      t.setAttribute("font-size", "11");
      t.setAttribute("fill", "#8A8A99");
      t.textContent = a.label;
      gAgents.appendChild(t);

      const e = document.createElementNS("http://www.w3.org/2000/svg", "line");
      e.setAttribute("x1", String(intent.x)); e.setAttribute("y1", String(intent.y));
      e.setAttribute("x2", String(a.x)); e.setAttribute("y2", String(a.y));
      e.setAttribute("stroke", "#4F8BFF"); e.setAttribute("stroke-width", "1");
      e.setAttribute("stroke-dasharray", "4 4"); e.setAttribute("opacity", "0.35");
      e.classList.add("agent-edge");
      gEdges.appendChild(e);
    });

    const intentRing = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    intentRing.setAttribute("cx", String(intent.x)); intentRing.setAttribute("cy", String(intent.y));
    intentRing.setAttribute("r", String(intent.r));
    intentRing.setAttribute("fill", "none"); intentRing.setAttribute("stroke", "#A78BFA");
    intentRing.setAttribute("stroke-width", "1.5");
    gAgents.appendChild(intentRing);
    const intentInner = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    intentInner.setAttribute("x", String(intent.x - 4)); intentInner.setAttribute("y", String(intent.y - 4));
    intentInner.setAttribute("width", "8"); intentInner.setAttribute("height", "8");
    intentInner.setAttribute("fill", "#A78BFA");
    gAgents.appendChild(intentInner);
    const intentLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
    intentLabel.setAttribute("x", String(intent.x)); intentLabel.setAttribute("y", String(intent.y + 40));
    intentLabel.setAttribute("text-anchor", "middle");
    intentLabel.setAttribute("font-family", "Geist Mono, monospace");
    intentLabel.setAttribute("font-size", "11"); intentLabel.setAttribute("fill", "#A78BFA");
    intentLabel.textContent = "> your prompt";
    gAgents.appendChild(intentLabel);

    type DataNode = { x: number; y: number; targetX: number; targetY: number; sz: number; life: number; ttl: number; speed: number; evidence: boolean };
    type ReportFlash = { t: number; fromX: number; fromY: number };
    let dataNodes: DataNode[] = [];
    let reportFlashes: ReportFlash[] = [];
    let last = performance.now();
    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    function spawnData() {
      if (dataNodes.length > 60) return;
      const target = agents[Math.floor(Math.random() * agents.length)];
      dataNodes.push({
        x: rand(20, W - 20), y: rand(20, H - 20),
        targetX: target.x, targetY: target.y,
        sz: rand(4, 7), life: 0, ttl: rand(2.4, 4.2), speed: rand(0.6, 1.2),
        evidence: Math.random() < 0.08
      });
    }

    function tick(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (Math.random() < 0.45) spawnData();
      gData.innerHTML = ""; gEvidence.innerHTML = "";

      dataNodes.forEach((n) => {
        n.life += dt;
        const dx = n.targetX - n.x;
        const dy = n.targetY - n.y;
        const d = Math.hypot(dx, dy);
        const v = n.speed * 80 * dt;
        if (d > v) { n.x += (dx / d) * v; n.y += (dy / d) * v; }
        else { n.x = n.targetX; n.y = n.targetY; n.life = n.ttl; }
        const alpha = Math.max(0, 1 - n.life / n.ttl);
        const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        r.setAttribute("x", String(n.x - n.sz / 2)); r.setAttribute("y", String(n.y - n.sz / 2));
        r.setAttribute("width", String(n.sz)); r.setAttribute("height", String(n.sz));
        if (n.evidence) {
          r.setAttribute("fill", "#FFB020"); r.setAttribute("opacity", String(alpha));
          gEvidence.appendChild(r);
        } else {
          r.setAttribute("fill", "none"); r.setAttribute("stroke", "#8A8A99"); r.setAttribute("stroke-width", "1");
          r.setAttribute("opacity", String(alpha * 0.7));
          gData.appendChild(r);
        }
      });
      dataNodes = dataNodes.filter((n) => n.life < n.ttl);

      if (Math.random() < 0.005) {
        const synth = agents.find((a) => a.id === "synth")!;
        reportFlashes.push({ t: 0, fromX: synth.x, fromY: synth.y });
      }
      gReport.innerHTML = "";
      reportFlashes.forEach((f) => {
        f.t += dt;
        const p = Math.min(1, f.t / 0.9);
        const x = f.fromX + (intent.x - f.fromX) * p;
        const y = f.fromY + (intent.y - f.fromY) * p;
        const l = document.createElementNS("http://www.w3.org/2000/svg", "line");
        l.setAttribute("x1", String(f.fromX)); l.setAttribute("y1", String(f.fromY));
        l.setAttribute("x2", String(x)); l.setAttribute("y2", String(y));
        l.setAttribute("stroke", "#A78BFA"); l.setAttribute("stroke-width", "1");
        l.setAttribute("opacity", String(1 - p));
        gReport.appendChild(l);
      });
      reportFlashes = reportFlashes.filter((f) => f.t < 1);

      const dashOffset = (now / 30) % 8;
      gEdges.querySelectorAll(".agent-edge").forEach((e) => e.setAttribute("stroke-dashoffset", String(-dashOffset)));

      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <section className="section" id="swarm">
      <div className="container-x">
        <div className="section-eyebrow"><span className="bar" /> 03 · execution model</div>
        <h2 className="section-heading"><span className="prompt">&gt;</span> the swarm</h2>

        <div className="swarm-wrap">
          <div className="swarm-canvas corners">
            <span className="corner-tl" />
            <span className="corner-br" />
            <svg ref={svgRef} width="100%" height="540" preserveAspectRatio="xMidYMid meet">
              <g className="g-grid" />
              <g className="g-edges" />
              <g className="g-data" />
              <g className="g-evidence" />
              <g className="g-agents" />
              <g className="g-report" />
            </svg>
          </div>

          <div className="swarm-caption">
            <p>
              non-deterministic llms reach consensus via fixed seeds and majority validation across somnia nodes.
              every step leaves an audit receipt on-chain.
            </p>
            <div className="swarm-legend">
              <div className="lg"><span className="lg-mark intent" /> intent · user-owned</div>
              <div className="lg"><span className="lg-mark agent" /> agent · system</div>
              <div className="lg"><span className="lg-mark data" /> data node · ledger fragment</div>
              <div className="lg"><span className="lg-mark evidence" /> evidence · flagged</div>
              <div className="lg"><span className="lg-mark report" /> report · returns to user</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
