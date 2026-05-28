"use client";

import { MOCK } from "@/lib/mock";

const CAP_GLYPHS: Record<string, React.ReactNode> = {
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
  )
};

export function Capabilities() {
  return (
    <section className="section" id="capabilities">
      <div className="container-x">
        <div className="section-eyebrow"><span className="bar" /> 04 · surface area</div>
        <h2 className="section-heading"><span className="prompt">&gt;</span> what the swarm can answer</h2>

        <div className="cap-grid">
          {MOCK.capabilities.map((c) => (
            <div key={c.title} className="cap-tile">
              <div className="cap-glyph">{CAP_GLYPHS[c.glyph]}</div>
              <div className="cap-title">{c.title}</div>
              <div className="cap-body">{c.body}</div>
              <div className="cap-foot">&gt; example: &quot;{c.example}&quot;</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
