/* global React, PixelGrid */

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-bg"><PixelGrid density={0.10} violetRatio={0.55} opacity={0.6} /></div>
      <div className="container footer-inner">
        <div className="footer-left">
          <div className="big"><span className="brand-mark">{"{s}"}</span>hinyAudit</div>
          <div className="tag"><span className="prompt">&gt;</span> a swarm. a ledger. a verdict.</div>
          <div className="chips">
            <span className="chip">chain 5031</span>
            <span className="chip">agentic L1</span>
            <span className="chip">phase 1</span>
          </div>
        </div>

        <div className="footer-col">
          <div className="footer-col-h">product</div>
          <a href="#console">console</a>
          <a href="#swarm">swarm</a>
          <a href="#receipts">pricing</a>
          <a href="#">changelog</a>
        </div>
        <div className="footer-col">
          <div className="footer-col-h">docs</div>
          <a href="#">agents</a>
          <a href="#">api</a>
          <a href="#">receipts</a>
          <a href="#">whitepaper</a>
        </div>
        <div className="footer-col">
          <div className="footer-col-h">community</div>
          <a href="#">telegram</a>
          <a href="#">discord</a>
          <a href="#">x</a>
          <a href="#">github</a>
        </div>
        <div className="footer-col">
          <div className="footer-col-h">build</div>
          <a href="#">request access</a>
          <a href="#">apply as agent</a>
          <a href="#">bug bounty</a>
          <a href="#">contact</a>
        </div>
      </div>

      <div className="container footer-builton">
        <div>© 2026 {"{s}"}hinyAudit · no custody · read-only on-chain · use at own risk.</div>
        <div className="right">&gt; built on <span className="brand-mark">{"{s}"}</span>omnia &nbsp;·&nbsp; submission · somnia agentathon · 2026</div>
      </div>
    </footer>
  );
}

window.Footer = Footer;
