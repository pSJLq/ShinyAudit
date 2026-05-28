/* global React */
const { useState } = React;

function SankeyFlow() {
  // hand-tuned sankey for the worked example. blue lines; amber/red on flagged paths.
  return (
    <svg className="sankey" viewBox="0 0 880 280" preserveAspectRatio="none">
      <defs>
        <pattern id="dots" width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="2" height="2" fill="rgba(79,139,255,0.06)" />
        </pattern>
      </defs>
      <rect width="880" height="280" fill="url(#dots)" />

      {/* nodes */}
      {[
        { x: 30,  y: 110, w: 22, h: 60,  label: "0xdrop…", color: "#A78BFA", labelColor: "#A78BFA" },
        { x: 280, y: 30,  w: 22, h: 36,  label: "sybil-01", color: "#4F8BFF" },
        { x: 280, y: 90,  w: 22, h: 28,  label: "sybil-02", color: "#4F8BFF" },
        { x: 280, y: 138, w: 22, h: 50,  label: "sybil-03", color: "#FFB020" },
        { x: 280, y: 208, w: 22, h: 44,  label: "sybil-04", color: "#4F8BFF" },
        { x: 540, y: 50,  w: 22, h: 30,  label: "bridge",   color: "#4F8BFF" },
        { x: 540, y: 110, w: 22, h: 80,  label: "mixer",    color: "#FF4D4D", labelColor: "#FF4D4D" },
        { x: 540, y: 220, w: 22, h: 32,  label: "exch.",    color: "#4F8BFF" },
        { x: 820, y: 90,  w: 22, h: 100, label: "unknown",  color: "#FFB020", labelColor: "#FFB020" },
      ].map((n, i) => (
        <g key={i}>
          <rect x={n.x} y={n.y} width={n.w} height={n.h} fill={n.color} />
          <text x={n.x + n.w + 8} y={n.y + n.h/2 + 4}
            fontFamily="Geist Mono, monospace" fontSize="11"
            fill={n.labelColor || "#8A8A99"}>{n.label}</text>
        </g>
      ))}

      {/* edges (manually-curved paths) */}
      {[
        { d: "M52 130 C 180 50, 200 50, 280 50",  c: "#4F8BFF", o: 0.35 },
        { d: "M52 140 C 180 100, 200 100, 280 100", c: "#4F8BFF", o: 0.3 },
        { d: "M52 150 C 180 160, 200 160, 280 158", c: "#FFB020", o: 0.5 },
        { d: "M52 160 C 180 220, 200 220, 280 225", c: "#4F8BFF", o: 0.3 },

        { d: "M302 50  C 400 60, 460 60, 540 65",  c: "#4F8BFF", o: 0.35 },
        { d: "M302 100 C 400 120, 460 130, 540 140", c: "#4F8BFF", o: 0.35 },
        { d: "M302 158 C 400 150, 460 150, 540 150", c: "#FF4D4D", o: 0.55 },
        { d: "M302 225 C 400 230, 460 230, 540 230", c: "#4F8BFF", o: 0.3 },

        { d: "M562 65  C 670 75, 720 85, 820 100",  c: "#4F8BFF", o: 0.25 },
        { d: "M562 150 C 670 140, 720 130, 820 130", c: "#FF4D4D", o: 0.55 },
        { d: "M562 230 C 670 200, 720 180, 820 170", c: "#FFB020", o: 0.45 },
      ].map((e, i) => (
        <path key={i} d={e.d} stroke={e.c} strokeWidth="2" fill="none" opacity={e.o} />
      ))}

      {/* annotations */}
      <text x="170" y="20" fontFamily="Geist Mono, monospace" fontSize="10" fill="#4A4A57">hop · 1</text>
      <text x="430" y="20" fontFamily="Geist Mono, monospace" fontSize="10" fill="#4A4A57">hop · 2</text>
      <text x="690" y="20" fontFamily="Geist Mono, monospace" fontSize="10" fill="#4A4A57">hop · 3</text>
    </svg>
  );
}

function Dossier() {
  const d = window.MOCK.dossier;
  return (
    <section className="section" id="dossier">
      <div className="container">
        <div className="section-eyebrow"><span className="bar" /> 06 · worked example</div>
        <h2 className="section-heading"><span className="prompt">&gt;</span> sample investigation</h2>

        <div className="dossier">
          {/* BANNER */}
          <div className="dossier-banner corners">
            <span className="corner-tl" /><span className="corner-br" />
            <div className="lines">
              <div><span className="prompt">&gt;</span> dossier <b>#{d.id}</b></div>
              <div><span className="prompt">&gt;</span> prompt: <b>"{d.prompt}"</b></div>
              <div><span className="prompt">&gt;</span> dispatched <span className="n">{d.dispatched}</span></div>
              <div><span className="prompt">&gt;</span> nodes <span className="n">{d.nodes}</span> · agents <span className="n">{d.agents}</span> · duration <span className="n">{d.duration}s</span> · cost <span className="n">{d.cost} STT</span></div>
            </div>
            <div className="meta">
              receipt 0x7f3a…d2c1<br />
              consensus 6 / 7<br />
              sealed · immutable
            </div>
          </div>

          {/* SUMMARY */}
          <div className="dossier-panel dossier-summary">
            <div className="dp-h"><span className="num">01</span> summary <span className="bar" /></div>
            <ul>
              {d.summary.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>

          {/* TIMELINE */}
          <div className="dossier-panel">
            <div className="dp-h"><span className="num">02</span> timeline <span className="bar" /></div>
            <div className="timeline">
              {d.timeline.map((t, i) => (
                <div key={i} className={"tl-row " + (t.kind)}>
                  <span className="ts">{t.ts}</span>
                  <span className="marker" />
                  <span className="text">{t.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* FLOW */}
          <div className="dossier-panel">
            <div className="dp-h"><span className="num">03</span> flow graph · 0xdrop… → unknown <span className="bar" /></div>
            <SankeyFlow />
            <div style={{ display: "flex", gap: 18, fontSize: 11, color: "var(--ink-muted)", marginTop: 12, flexWrap: "wrap" }}>
              <span><i style={{ display: "inline-block", width: 10, height: 10, background: "#4F8BFF", marginRight: 6, verticalAlign: "middle" }} />normal flow</span>
              <span><i style={{ display: "inline-block", width: 10, height: 10, background: "#FFB020", marginRight: 6, verticalAlign: "middle" }} />suspicious</span>
              <span><i style={{ display: "inline-block", width: 10, height: 10, background: "#FF4D4D", marginRight: 6, verticalAlign: "middle" }} />flagged · mixer</span>
            </div>
          </div>

          {/* FLAGGED */}
          <div className="dossier-panel">
            <div className="dp-h"><span className="num">04</span> flagged items <span className="bar" /></div>
            <div className="flagged-list">
              {d.flagged.map((f, i) => (
                <div className="flagged-card" key={i}>
                  <span className={"sev-chip " + f.sev}>● {f.sev}</span>
                  <div className="ft">{f.title}</div>
                  <div className="fb">{f.body}</div>
                  <div className="fr">{f.ref}</div>
                </div>
              ))}
            </div>
          </div>

          {/* CITATIONS */}
          <div className="dossier-panel">
            <div className="dp-h"><span className="num">05</span> citations <span className="bar" /></div>
            <div className="citations">
              {d.citations.map((c, i) => (
                <div key={i} className="cit">
                  <span className="id">{c.id}</span>
                  <span>{c.tag}</span>
                  <a href="#">view on explorer ↗</a>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="dossier-cta">
            <a className="btn--ghost" href="#">[ download dossier (.md / .pdf) ]</a>
            <a className="btn--ghost" href="#">[ share read-only link ]</a>
          </div>
        </div>
      </div>
    </section>
  );
}

window.Dossier = Dossier;
