"use client";

import { useState, type ReactNode } from "react";
import type {
  Block,
  Citation,
  CodeLine,
  KVValue,
  RiskItem,
  SankeyData,
  Verdict,
  VerdictGlyphKind
} from "./types";

/* ============== verdict glyph ============== */
function VerdictGlyph({ kind }: { kind: VerdictGlyphKind }) {
  const common: React.CSSProperties = {
    width: 32,
    height: 32,
    display: "grid",
    placeItems: "center",
    fontFamily: "var(--mono)",
    fontSize: 22,
    lineHeight: 1,
    color: "var(--fg)"
  };
  if (kind === "shield") return <div style={common}>◈</div>;
  if (kind === "wallet") return <div style={common}>◉</div>;
  if (kind === "flow") return <div style={common}>↬</div>;
  if (kind === "token") return <div style={common}>◐</div>;
  if (kind === "bell") return <div style={common}>◔</div>;
  return <div style={common}>{"{s}"}</div>;
}

/* ============== Verdict ============== */
export function VerdictView({ verdict }: { verdict: Verdict | null | undefined }) {
  if (!verdict) return null;
  const { tone, glyph, label, headline, score, scoreLabel } = verdict;
  return (
    <div className={`verdict ${tone}`}>
      <div className="verdict-glyph">
        <VerdictGlyph kind={glyph} />
      </div>
      <div className="verdict-body">
        <div className="label">&gt; {label}</div>
        <div className="headline">{headline}</div>
      </div>
      {score != null && (
        <div className={`verdict-score ${tone}`}>
          <div className="n">
            {score}
            <span className="n-suffix">/100</span>
          </div>
          <div className="l">{scoreLabel || "risk score / 100"}</div>
        </div>
      )}
    </div>
  );
}

/* ============== inline markdown ============== */
function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    if (text[i] === "*" && text[i + 1] === "*") {
      const end = text.indexOf("**", i + 2);
      if (end > -1) {
        out.push(<strong key={key++}>{text.slice(i + 2, end)}</strong>);
        i = end + 2;
        continue;
      }
    }
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > -1) {
        out.push(<code key={key++}>{text.slice(i + 1, end)}</code>);
        i = end + 1;
        continue;
      }
    }
    let next = i;
    while (next < text.length && text[next] !== "*" && text[next] !== "`") next++;
    out.push(<span key={key++}>{text.slice(i, next)}</span>);
    i = next;
  }
  return out;
}

function MarkdownBlock({ text }: { text: string }) {
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
function CodeBlock({ lang, title, lines }: { lang: string; title?: string; lines: CodeLine[] }) {
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    const txt = lines.map((l) => (l.tokens || []).map(([, t]) => t).join("")).join("\n");
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
          <button className="copy" onClick={onCopy} type="button">
            {copied ? "copied ✓" : "[ copy ]"}
          </button>
        </div>
        <pre>
          {lines.map((ln, idx) => (
            <div key={idx}>
              {ln.tokens.map(([cls, t], ti) => (
                <span key={ti} className={"tok-" + cls}>
                  {t}
                </span>
              ))}
              {ln.tokens.length === 0 ? " " : null}
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}

/* ============== kv-table ============== */
function KVTable({ rows }: { rows: Array<[string, KVValue]> }) {
  return (
    <div className="block block-kv">
      {rows.map(([k, v], idx) => {
        let valNode: ReactNode;
        if (typeof v === "string") {
          valNode = v;
        } else if ("chip" in v) {
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

/* ============== risk list ============== */
function RiskList({
  items,
  hasViewToggle,
  itemsByView,
  view,
  onSetView
}: {
  items?: RiskItem[];
  hasViewToggle?: boolean;
  itemsByView?: { user: RiskItem[]; founder: RiskItem[] };
  view?: "user" | "founder";
  onSetView?: (v: "user" | "founder") => void;
}) {
  const list = items || (itemsByView ? itemsByView[view || "user"] : []);
  return (
    <div className="block">
      <div className="block-label-row">
        <div className="block-label">&gt; findings · sorted by severity</div>
        {hasViewToggle && (
          <div className="view-toggle">
            <span className="vt-pre">// framing ::</span>
            <button
              type="button"
              className={"vt " + ((view || "user") === "user" ? "on" : "")}
              onClick={() => onSetView?.("user")}
            >
              user view
            </button>
            <button
              type="button"
              className={"vt " + ((view || "user") === "founder" ? "on" : "")}
              onClick={() => onSetView?.("founder")}
            >
              founder view
            </button>
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
            {it.aside && <div className="risk-aside">{it.aside}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============== callout ============== */
function Callout({ level, sym, text }: { level: "info" | "warn" | "danger"; sym?: string; text: string }) {
  const symbol = sym || (level === "danger" ? "‼" : level === "warn" ? "!" : "i");
  return (
    <div className={"block callout " + level}>
      <span className="sym">{symbol}</span>
      <span>{text}</span>
    </div>
  );
}

/* ============== sankey flow ============== */
function SankeyFlow({ title, data }: { title?: string; data?: SankeyData }) {
  // Default demo data used when synthesizer didn't ship its own structure.
  const fallback: SankeyData = {
    columns: [
      { label: "SOURCE", nodes: [{ id: "src", label: "0xdrop…cae9", sub: "1,240,000", color: "var(--fg)" }] },
      {
        label: "HOP 1",
        nodes: [
          { id: "cex",    label: "cex deposit", sub: "78%", color: "var(--red)" },
          { id: "bridge", label: "bridge",      sub: "8%",  color: "var(--amber)" },
          { id: "dex",    label: "dex swap",    sub: "3%",  color: "var(--blue)" }
        ]
      },
      {
        label: "HOP 2 · TERMINALS",
        nodes: [
          { id: "binance",  label: "Binance",   sub: "412k", color: "var(--red)" },
          { id: "kucoin",   label: "Kucoin",    sub: "320k", color: "var(--red)" },
          { id: "mexc",     label: "MEXC",      sub: "234k", color: "var(--red)" },
          { id: "arbitrum", label: "Arbitrum",  sub: "99k",  color: "var(--amber)" },
          { id: "sushi",    label: "Camelot",   sub: "37k",  color: "var(--blue)" }
        ]
      }
    ],
    links: [
      { from: "src",    to: "cex",      value: 78 },
      { from: "src",    to: "bridge",   value: 8 },
      { from: "src",    to: "dex",      value: 3 },
      { from: "cex",    to: "binance",  value: 42 },
      { from: "cex",    to: "kucoin",   value: 22 },
      { from: "cex",    to: "mexc",     value: 14 },
      { from: "bridge", to: "arbitrum", value: 8 },
      { from: "dex",    to: "sushi",    value: 3 }
    ]
  };

  const d = data || fallback;
  // Build position layout per column.
  const W = 920, H = 320;
  const colWidth = (W - 2 * 60) / (d.columns.length - 1);
  type Pos = { x: number; y: number; h: number; node: typeof d.columns[number]["nodes"][number] };
  const positions = new Map<string, Pos>();
  d.columns.forEach((col, ci) => {
    const total = col.nodes.reduce((s, n) => s + Math.max(20, 0), 0) + col.nodes.length * 40;
    const padTop = (H - total) / 2;
    let y = padTop;
    col.nodes.forEach((n) => {
      // height scales with link sum touching this node
      const incoming = d.links.filter((l) => l.to === n.id).reduce((s, l) => s + l.value, 0);
      const outgoing = d.links.filter((l) => l.from === n.id).reduce((s, l) => s + l.value, 0);
      const weight = Math.max(incoming, outgoing, 4);
      const h = Math.max(30, Math.min(180, weight * 2.2));
      positions.set(n.id, { x: 60 + ci * colWidth, y, h, node: n });
      y += h + 16;
    });
  });

  const path = (l: typeof d.links[number]) => {
    const a = positions.get(l.from);
    const b = positions.get(l.to);
    if (!a || !b) return "";
    const x1 = a.x + 160;
    const x2 = b.x;
    const xm = (x1 + x2) / 2;
    const y1t = a.y, y1b = a.y + a.h;
    const y2t = b.y, y2b = b.y + b.h;
    return `M ${x1} ${y1t} C ${xm} ${y1t}, ${xm} ${y2t}, ${x2} ${y2t} L ${x2} ${y2b} C ${xm} ${y2b}, ${xm} ${y1b}, ${x1} ${y1b} Z`;
  };

  const linkColor = (l: typeof d.links[number]) => {
    if (l.color) return l.color;
    const a = positions.get(l.from);
    if (!a) return "rgba(110,110,237,0.30)";
    const c = a.node.color || "var(--blue)";
    if (c.includes("red"))   return "rgba(212,56,0,0.30)";
    if (c.includes("amber")) return "rgba(212,154,0,0.30)";
    if (c.includes("blue"))  return "rgba(110,110,237,0.30)";
    return "rgba(245,245,245,0.20)";
  };

  return (
    <div className="block">
      {title && <div className="block-label">&gt; {title}</div>}
      <div className="sankey">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
          {d.links.map((l, idx) => (
            <path key={idx} d={path(l)} fill={linkColor(l)} stroke="none" />
          ))}
          {Array.from(positions.entries()).map(([id, p]) => (
            <g key={id}>
              <rect x={p.x} y={p.y} width={160} height={p.h} fill={p.node.color || "var(--blue)"} opacity={0.85} />
              <text
                x={p.x + 8}
                y={p.y + 16}
                fill="rgba(0,0,0,0.85)"
                fontFamily="var(--mono)"
                fontSize="11"
                fontWeight="600"
                letterSpacing="-0.02em"
              >
                {p.node.label}
              </text>
              {p.node.sub && (
                <text x={p.x + 8} y={p.y + 32} fill="rgba(0,0,0,0.7)" fontFamily="var(--mono)" fontSize="10">
                  {p.node.sub}
                </text>
              )}
            </g>
          ))}
          {d.columns.map((col, ci) => (
            <text
              key={ci}
              x={60 + ci * colWidth}
              y={20}
              fill="var(--fg-faint)"
              fontFamily="var(--mono)"
              fontSize="10"
              letterSpacing="0.08em"
            >
              {col.label}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}

/* ============== citations footer ============== */
export function CitationsBlock({ citations }: { citations: Citation[] }) {
  const [open, setOpen] = useState(false);
  if (!citations || citations.length === 0) return null;
  return (
    <div className="citations">
      <div className="citations-head">
        <span className="label">
          &gt; citations · {citations.length} receipt{citations.length === 1 ? "" : "s"}
        </span>
        <button type="button" className="toggle" onClick={() => setOpen((o) => !o)}>
          {open ? "[ hide raw ]" : "[ expand raw outputs ]"}
        </button>
      </div>
      {citations.map((c, idx) => (
        <div className="citation" key={idx}>
          <span className="hash">{c.hash}</span>
          <span className="who">· {c.agent}</span>
          <span className="what">{c.what}</span>
          {c.consensus && <span className="consensus">consensus {c.consensus}</span>}
          <a className="receipt" href={c.receipt} target="_blank" rel="noopener noreferrer">
            receipt ↗
          </a>
        </div>
      ))}
      {open && (
        <div className="block block-code" style={{ marginTop: 12 }}>
          <div className="block-code-header">
            <span className="lang">// raw outputs</span>
          </div>
          <pre>
            {JSON.stringify(
              citations.map((c) => ({ hash: c.hash, agent: c.agent, what: c.what, consensus: c.consensus })),
              null,
              2
            )}
          </pre>
        </div>
      )}
    </div>
  );
}

/* ============== dispatch renderer ============== */
export function BlockRenderer({
  block,
  view,
  onSetView
}: {
  block: Block;
  view: "user" | "founder";
  onSetView: (v: "user" | "founder") => void;
}) {
  switch (block.type) {
    case "markdown":
      return <MarkdownBlock text={block.text} />;
    case "code":
      return <CodeBlock lang={block.lang} title={block.title} lines={block.lines} />;
    case "kv-table":
      return <KVTable rows={block.rows} />;
    case "risk-list":
      return (
        <RiskList
          items={block.items}
          hasViewToggle={block.hasViewToggle}
          itemsByView={block.itemsByView}
          view={view}
          onSetView={onSetView}
        />
      );
    case "callout":
      return <Callout level={block.level} sym={block.sym} text={block.text} />;
    case "sankey":
      return <SankeyFlow title={block.title} data={block.data} />;
    default:
      return null;
  }
}
