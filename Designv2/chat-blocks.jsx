/* chat-blocks.jsx — content-block renderers used inside swarm replies */

const { useState } = React;

/* ============== glyphs (small geometric icons, no SVG hand-drawing) ============== */
function VerdictGlyph({ kind }) {
  // small shield/wallet/flow/token glyphs from CSS shapes
  const common = {
    width: 32, height: 32, display: "grid", placeItems: "center",
    fontFamily: "var(--mono)", fontSize: 22, lineHeight: 1, color: "var(--fg)",
  };
  if (kind === "shield") return <div style={common}>◈</div>;
  if (kind === "wallet") return <div style={common}>◉</div>;
  if (kind === "flow")   return <div style={common}>↬</div>;
  if (kind === "token")  return <div style={common}>◐</div>;
  if (kind === "bell")   return <div style={common}>◔</div>;
  return <div style={common}>{"{s}"}</div>;
}

/* ============== Verdict block ============== */
function Verdict({ verdict }) {
  if (!verdict) return null;
  const { tone, glyph, label, headline, score, scoreLabel } = verdict;
  return (
    <div className={`verdict ${tone}`}>
      <div className="verdict-glyph"><VerdictGlyph kind={glyph} /></div>
      <div className="verdict-body">
        <div className="label">&gt; {label}</div>
        <div className="headline">{headline}</div>
      </div>
      {score != null && (
        <div className={`verdict-score ${tone}`}>
          <div className="n">{score}<span className="n-suffix">/100</span></div>
          <div className="l">{scoreLabel}</div>
        </div>
      )}
    </div>
  );
}

/* ============== markdown ============== */
function renderInline(text) {
  // very small markdown: **bold**, `code`, [text](url)
  const out = [];
  let i = 0; let key = 0;
  while (i < text.length) {
    if (text[i] === "*" && text[i+1] === "*") {
      const end = text.indexOf("**", i + 2);
      if (end > -1) {
        out.push(<strong key={key++}>{text.slice(i + 2, end)}</strong>);
        i = end + 2; continue;
      }
    }
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > -1) {
        out.push(<code key={key++}>{text.slice(i + 1, end)}</code>);
        i = end + 1; continue;
      }
    }
    // accumulate plain text
    let next = i;
    while (next < text.length && text[next] !== "*" && text[next] !== "`") next++;
    out.push(<React.Fragment key={key++}>{text.slice(i, next)}</React.Fragment>);
    i = next;
  }
  return out;
}

function MarkdownBlock({ text }) {
  const paras = text.split(/\n\n+/);
  return (
    <div className="block block-markdown">
      {paras.map((p, idx) => (
        <p key={idx}>{renderInline(p)}</p>
      ))}
    </div>
  );
}

/* ============== code block ============== */
function CodeBlock({ lang, title, lines }) {
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    const txt = lines.map(l => (l.tokens || []).map(([_, t]) => t).join("")).join("\n");
    navigator.clipboard?.writeText(txt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div className="block">
      {title && <div className="block-label">&gt; {title}</div>}
      <div className="block-code">
        <div className="block-code-header">
          <span className="lang">// {lang}</span>
          <span className="copy" onClick={onCopy}>{copied ? "copied ✓" : "[ copy ]"}</span>
        </div>
        <pre>
          {lines.map((ln, idx) => (
            <div key={idx}>
              {ln.tokens.map(([cls, t], ti) => (
                <span key={ti} className={"tok-" + cls}>{t}</span>
              ))}
              {ln.tokens.length === 0 ? "\u00A0" : null}
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}

/* ============== kv-table ============== */
function KVTable({ rows }) {
  return (
    <div className="block block-kv">
      {rows.map(([k, v], idx) => {
        let valNode;
        if (typeof v === "string") {
          valNode = v;
        } else if (v && typeof v === "object") {
          if (v.chip === "addr" || v.chip === "tx") {
            valNode = (
              <span className={"chip-" + (v.chip === "tx" ? "tx" : "addr")}>
                {v.chip === "tx" ? <span className="lead">tx</span> : null}
                <span>{v.v}</span>
                {v.tag ? <span className="tag">↗ {v.tag}</span> : null}
              </span>
            );
          } else {
            valNode = v.v;
          }
        }
        return (
          <div className="row" key={idx}>
            <div className="k">{k}</div>
            <div className="v">{valNode}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ============== risk-list ============== */
function RiskList({ items, hasViewToggle, itemsByView, view, onSetView }) {
  const list = items || (itemsByView ? itemsByView[view || "user"] : []);
  return (
    <div className="block">
      <div className="block-label-row">
        <div className="block-label">&gt; findings · sorted by severity</div>
        {hasViewToggle && (
          <div className="view-toggle">
            <span className="vt-pre">// framing ::</span>
            <button className={"vt " + ((view || "user") === "user" ? "on" : "")} onClick={() => onSetView && onSetView("user")}>user view</button>
            <button className={"vt " + ((view || "user") === "founder" ? "on" : "")} onClick={() => onSetView && onSetView("founder")}>founder view</button>
          </div>
        )}
      </div>
      <div className="risk-list">
        {list.map((it, idx) => (
          <div className={"risk-card " + it.sev} key={idx}>
            <span className={"risk-sev " + it.sev}>{it.sev}</span>
            <div className="risk-body">
              <div className="title">{it.title}</div>
              <div className="desc">{renderInline(it.desc)}</div>
              {it.ref && (
                <div className="ref">
                  &gt; {it.ref.txt} {it.ref.tx && <span className="tx">· {it.ref.tx} ↗</span>}
                </div>
              )}
            </div>
            <div className="risk-aside">{it.aside}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============== callout ============== */
function Callout({ level, sym, text }) {
  return (
    <div className={"block callout " + level}>
      <span className="sym">{sym}</span>
      <span>{text}</span>
    </div>
  );
}

/* ============== sankey flow ============== */
function SankeyFlow({ title }) {
  // hand-tuned sankey representing the demo trace.
  // 1 source -> 3 hop1 nodes -> 5 terminals labelled CEX / DEX / BRIDGE / HOLD
  const w = 920, h = 320;
  const cols = [
    { x: 60,   nodes: [{ y: 60,  h: 200, label: "0xdrop…cae9", sub: "1,240,000 SOPAY", color: "var(--fg)" }] },
    { x: 350,  nodes: [
      { y: 30,  h: 160, label: "hop 1 · cex deposit",   sub: "967,200  78%", color: "var(--red)" },
      { y: 200, h: 50,  label: "hop 1 · bridge",         sub: "99,200  8%",  color: "var(--amber)" },
      { y: 260, h: 38,  label: "hop 1 · dex swap",       sub: "37,200  3%",  color: "var(--blue)" },
    ]},
    { x: 720,  nodes: [
      { y: 30,  h: 64,  label: "Binance",      sub: "412k", color: "var(--red)" },
      { y: 100, h: 54,  label: "Kucoin",       sub: "320k", color: "var(--red)" },
      { y: 158, h: 36,  label: "MEXC",         sub: "234k", color: "var(--red)" },
      { y: 200, h: 50,  label: "Arbitrum",     sub: "99k",  color: "var(--amber)" },
      { y: 258, h: 38,  label: "Sushi/Camelot",sub: "37k",  color: "var(--blue)" },
    ]},
  ];
  // links (src col-row -> dst col-row, thickness ~ src height fraction)
  const links = [
    { from: [0, 0], to: [1, 0], top: 60,  bot: 220, color: "rgba(212,56,0,0.30)" },
    { from: [0, 0], to: [1, 1], top: 220, bot: 250, color: "rgba(212,154,0,0.30)" },
    { from: [0, 0], to: [1, 2], top: 250, bot: 260, color: "rgba(110,110,237,0.30)" },

    { from: [1, 0], to: [2, 0], top: 30,  bot: 94,  color: "rgba(212,56,0,0.30)" },
    { from: [1, 0], to: [2, 1], top: 94,  bot: 148, color: "rgba(212,56,0,0.30)" },
    { from: [1, 0], to: [2, 2], top: 148, bot: 184, color: "rgba(212,56,0,0.30)" },
    { from: [1, 1], to: [2, 3], top: 200, bot: 250, color: "rgba(212,154,0,0.30)" },
    { from: [1, 2], to: [2, 4], top: 258, bot: 296, color: "rgba(110,110,237,0.30)" },
  ];

  const path = (l) => {
    const a = cols[l.from[0]].nodes[l.from[1]];
    const b = cols[l.to[0]].nodes[l.to[1]];
    const x1 = cols[l.from[0]].x + 160;
    const x2 = cols[l.to[0]].x;
    const xm = (x1 + x2) / 2;
    const y1t = a.y, y1b = a.y + a.h;
    const y2t = b.y, y2b = b.y + b.h;
    return `M ${x1} ${y1t} C ${xm} ${y1t}, ${xm} ${y2t}, ${x2} ${y2t} L ${x2} ${y2b} C ${xm} ${y2b}, ${xm} ${y1b}, ${x1} ${y1b} Z`;
  };

  return (
    <div className="block">
      {title && <div className="block-label">&gt; {title}</div>}
      <div className="sankey">
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
          {links.map((l, idx) => (
            <path key={idx} d={path(l)} fill={l.color} stroke="none" />
          ))}
          {cols.map((col, ci) => col.nodes.map((n, ni) => (
            <g key={`${ci}-${ni}`}>
              <rect x={col.x} y={n.y} width={160} height={n.h} fill={n.color} opacity={ci===0?1:0.85} />
              <text x={col.x + 8} y={n.y + 16} fill={ci===0 ? "var(--bg)" : "var(--bg)"}
                    fontFamily="var(--mono)" fontSize="11" fontWeight="600" letterSpacing="-0.02em">
                {n.label}
              </text>
              <text x={col.x + 8} y={n.y + 32} fill={ci===0 ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.7)"}
                    fontFamily="var(--mono)" fontSize="10">
                {n.sub}
              </text>
            </g>
          )))}
          {/* column labels */}
          <text x={cols[0].x} y={20} fill="var(--fg-faint)" fontFamily="var(--mono)" fontSize="10" letterSpacing="0.08em">SOURCE</text>
          <text x={cols[1].x} y={20} fill="var(--fg-faint)" fontFamily="var(--mono)" fontSize="10" letterSpacing="0.08em">HOP 1</text>
          <text x={cols[2].x} y={20} fill="var(--fg-faint)" fontFamily="var(--mono)" fontSize="10" letterSpacing="0.08em">HOP 2 · TERMINALS</text>
        </svg>
      </div>
    </div>
  );
}

/* ============== citations footer ============== */
function Citations({ citations }) {
  const [open, setOpen] = useState(false);
  if (!citations || citations.length === 0) return null;
  return (
    <div className="citations">
      <div className="citations-head">
        <span className="label">&gt; citations · {citations.length} receipt{citations.length === 1 ? "" : "s"}</span>
        <span className="toggle" onClick={() => setOpen(o => !o)}>{open ? "[ hide raw ]" : "[ expand raw outputs ]"}</span>
      </div>
      {citations.map((c, idx) => (
        <div className="citation" key={idx}>
          <span className="hash">{c.hash}</span>
          <span className="who">·  {c.agent}</span>
          <span className="what">{c.what}</span>
          {c.consensus && <span className="consensus">consensus {c.consensus}</span>}
          <a className="receipt" href={c.receipt} target="_blank" rel="noreferrer">receipt ↗</a>
        </div>
      ))}
      {open && (
        <div className="block block-code" style={{ marginTop: 12 }}>
          <div className="block-code-header"><span className="lang">// raw outputs</span></div>
          <pre>{`{
  "scout-fetch":      { "consensus": "6/7", "bytes": 14523, "ok": true },
  "contract-decoder": { "consensus": "6/7", "findings": 6, "ok": true },
  "auditor-llm":      { "consensus": "5/7", "tokens": 1843, "ok": true },
  "synthesizer":      { "consensus": "6/7", "sealed": "0x...", "ok": true }
}`}</pre>
        </div>
      )}
    </div>
  );
}

/* ============== exported ============== */
function BlockRenderer({ block, view, onSetView }) {
  switch (block.type) {
    case "markdown":  return <MarkdownBlock text={block.text} />;
    case "code":      return <CodeBlock lang={block.lang} title={block.title} lines={block.lines} />;
    case "kv-table":  return <KVTable rows={block.rows} />;
    case "risk-list": return <RiskList items={block.items} hasViewToggle={block.hasViewToggle} itemsByView={block.itemsByView} view={view} onSetView={onSetView} />;
    case "callout":   return <Callout level={block.level} sym={block.sym} text={block.text} />;
    case "sankey":    return <SankeyFlow title={block.title} />;
    default: return null;
  }
}

Object.assign(window, { BlockRenderer, Verdict, Citations, VerdictGlyph });
