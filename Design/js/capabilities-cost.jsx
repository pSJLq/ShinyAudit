/* global React */

const CAP_GLYPHS = {
  contract: (
    <svg viewBox="0 0 32 32" fill="none">
      <rect x="4" y="3" width="20" height="26" stroke="#4F8BFF" strokeWidth="1.5" />
      <line x1="9" y1="10" x2="19" y2="10" stroke="#4F8BFF" strokeWidth="1.5" />
      <line x1="9" y1="15" x2="19" y2="15" stroke="#4F8BFF" strokeWidth="1.5" />
      <line x1="9" y1="20" x2="14" y2="20" stroke="#4F8BFF" strokeWidth="1.5" />
      <rect x="22" y="22" width="7" height="7" stroke="#4F8BFF" strokeWidth="1.5" />
      <path d="M24 25.5 L25.5 27 L28 24" stroke="#4F8BFF" strokeWidth="1.5" />
    </svg>
  ),
  flow: (
    <svg viewBox="0 0 32 32" fill="none">
      <rect x="2" y="14" width="5" height="5" stroke="#4F8BFF" strokeWidth="1.5" />
      <rect x="13" y="5" width="5" height="5" stroke="#4F8BFF" strokeWidth="1.5" />
      <rect x="13" y="23" width="5" height="5" stroke="#4F8BFF" strokeWidth="1.5" />
      <rect x="25" y="14" width="5" height="5" stroke="#4F8BFF" strokeWidth="1.5" />
      <path d="M7 16 L13 8 M7 17 L13 25 M18 8 L25 16 M18 25 L25 17" stroke="#4F8BFF" strokeWidth="1.5" strokeDasharray="2 2" />
    </svg>
  ),
  stealth: (
    <svg viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="11" stroke="#4F8BFF" strokeWidth="1.5" strokeDasharray="3 2" />
      <rect x="13" y="13" width="6" height="6" fill="#4F8BFF" />
      <line x1="16" y1="2" x2="16" y2="5" stroke="#4F8BFF" strokeWidth="1.5" />
      <line x1="16" y1="27" x2="16" y2="30" stroke="#4F8BFF" strokeWidth="1.5" />
    </svg>
  ),
  wallet: (
    <svg viewBox="0 0 32 32" fill="none">
      <rect x="3" y="8" width="26" height="18" stroke="#4F8BFF" strokeWidth="1.5" />
      <rect x="3" y="4" width="22" height="4" stroke="#4F8BFF" strokeWidth="1.5" />
      <rect x="20" y="14" width="9" height="6" fill="#4F8BFF" opacity="0.3" />
      <rect x="23" y="16" width="2" height="2" fill="#4F8BFF" />
    </svg>
  ),
  xray: (
    <svg viewBox="0 0 32 32" fill="none">
      <rect x="4" y="4" width="24" height="24" stroke="#4F8BFF" strokeWidth="1.5" />
      <line x1="4" y1="11" x2="28" y2="11" stroke="#4F8BFF" strokeWidth="1.5" />
      <line x1="4" y1="18" x2="28" y2="18" stroke="#4F8BFF" strokeWidth="1.5" />
      <line x1="4" y1="25" x2="28" y2="25" stroke="#4F8BFF" strokeWidth="1.5" />
      <rect x="11" y="13" width="3" height="3" fill="#4F8BFF" />
      <rect x="18" y="20" width="3" height="3" fill="#4F8BFF" />
      <rect x="6" y="6" width="3" height="3" fill="#4F8BFF" />
    </svg>
  ),
  watch: (
    <svg viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="11" stroke="#4F8BFF" strokeWidth="1.5" />
      <line x1="16" y1="16" x2="16" y2="9" stroke="#4F8BFF" strokeWidth="1.5" />
      <line x1="16" y1="16" x2="21" y2="18" stroke="#4F8BFF" strokeWidth="1.5" />
      <rect x="14" y="2" width="4" height="3" fill="#4F8BFF" />
      <rect x="14" y="27" width="4" height="3" fill="#4F8BFF" />
    </svg>
  ),
};

function Capabilities() {
  return (
    <section className="section" id="capabilities">
      <div className="container">
        <div className="section-eyebrow"><span className="bar" /> 04 · surface area</div>
        <h2 className="section-heading"><span className="prompt">&gt;</span> what the swarm can answer</h2>

        <div className="cap-grid">
          {window.MOCK.capabilities.map(c => (
            <div key={c.title} className="cap-tile">
              <div className="cap-glyph">{CAP_GLYPHS[c.glyph]}</div>
              <div className="cap-title">{c.title}</div>
              <div className="cap-body">{c.body}</div>
              <div className="cap-foot">&gt; example: "{c.example}"</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CostStrip() {
  return (
    <section className="section" id="receipts">
      <div className="container">
        <div className="section-eyebrow"><span className="bar" /> 05 · transparency</div>
        <h2 className="section-heading"><span className="prompt">&gt;</span> cost &amp; receipts</h2>

        <div className="cost-strip">
          <div className="cost-cell">
            <h3><span className="prompt">&gt;</span> billing model</h3>
            <div className="billing-rows">
              <div className="br"><span className="k">agent_cost</span><span className="v">Σ(agent.fee · invocations)</span></div>
              <div className="br"><span className="k">service</span><span className="v">agent_cost × 0.50</span></div>
              <div className="br"><span className="k">total</span><span className="v">agent_cost + service</span></div>
              <div className="br"><span className="k">currency</span><span className="v">STT  (somnia testnet token)</span></div>
            </div>
            <p style={{ marginTop: 24, fontSize: 12, color: "var(--ink-muted)", lineHeight: 1.6 }}>
              every invocation emits an on-chain receipt. you pay only for compute
              you authorize. nothing is buffered, nothing is custodied.
            </p>
          </div>

          <div className="cost-cell">
            <h3><span className="prompt">&gt;</span> sample receipt · on-chain artifact</h3>
            <div className="receipt">
              <div><span className="k">receipt</span><span className="v">0x7f3a…d2c1</span></div>
              <div><span className="k">agent</span><span className="v">llm-inference</span></div>
              <div><span className="k">function</span><span className="v">inferToolsChat</span></div>
              <div><span className="k">nodes</span><span className="v">7  (consensus 6 / 7)</span></div>
              <div><span className="k">gas</span><span className="v">412,308</span></div>
              <div><span className="k">ts</span><span className="v">2026-05-24T12:18:44Z</span></div>
              <div className="divider">─ output ──────────────────────</div>
              <div className="verdict">
                {"{ \"verdict\": \"contract has owner-only mint without timelock; severity high\" }"}
              </div>
              <a href="#dossier">[ view on explorer.somnia.network ↗ ]</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

window.Capabilities = Capabilities;
window.CostStrip = CostStrip;
