"use client";

import { EXPLORER_URL } from "@/lib/somnia/chains";

// CRIT-2 fix: render via JSON.stringify so the verdict displays as
// proper JSON, not as escaped string literal with backslashes.
const SAMPLE_VERDICT = {
  verdict: "contract has owner-only mint without timelock; severity high"
};

export function CostStrip() {
  return (
    <section className="section" id="receipts">
      <div className="container-x">
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
              every invocation emits an on-chain receipt. you pay only for compute you authorize.
              nothing is buffered, nothing is custodied.
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
              <pre className="verdict">{JSON.stringify(SAMPLE_VERDICT, null, 2)}</pre>
              <a href={EXPLORER_URL} target="_blank" rel="noopener noreferrer">
                [ view on {EXPLORER_URL.replace(/^https?:\/\//, "")} ↗ ]
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
