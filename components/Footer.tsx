"use client";

import { PixelGrid } from "./PixelGrid";

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-bg">
        <PixelGrid density={0.08} violetRatio={0.55} opacity={0.6} />
      </div>
      <div className="container-x footer-inner">
        <div className="footer-left">
          <div className="big"><span className="brand-mark">{"{s}"}</span>hinyAudit</div>
          <div className="tag"><span className="prompt">&gt;</span> a swarm. a ledger. a verdict.</div>
          <div className="chips">
            <span className="chip">chain 50312</span>
            <span className="chip">agentic L1</span>
            <span className="chip">phase 1</span>
          </div>
        </div>

        <div className="footer-col">
          <div className="footer-col-h">product</div>
          <a href="#console">console</a>
          <a href="#swarm">swarm</a>
          <a href="#receipts">pricing</a>
          <a href="#capabilities">capabilities</a>
        </div>
        <div className="footer-col">
          <div className="footer-col-h">docs</div>
          <a href="https://docs.somnia.network/agents" target="_blank" rel="noopener noreferrer">somnia agents</a>
          <a href="https://docs.somnia.network/" target="_blank" rel="noopener noreferrer">somnia docs</a>
          <a href="https://shannon-explorer.somnia.network/" target="_blank" rel="noopener noreferrer">explorer</a>
          <a href="#">whitepaper</a>
        </div>
        <div className="footer-col">
          <div className="footer-col-h">community</div>
          <a href="https://t.me/+XHq0F0JXMyhmMzM0" target="_blank" rel="noopener noreferrer">telegram</a>
          <a href="#">discord</a>
          <a href="#">x</a>
          <a href="#">github</a>
        </div>
      </div>

      <div className="container-x footer-builton">
        <div>© 2026 {"{s}"}hinyAudit · no custody · read-only on-chain · use at own risk.</div>
        <div className="right">
          &gt; built on <span className="brand-mark">{"{s}"}</span>omnia &nbsp;·&nbsp; submission · somnia agentathon · 2026
        </div>
      </div>
    </footer>
  );
}
