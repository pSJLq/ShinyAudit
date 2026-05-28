"use client";

import { SMark } from "./SMark";
import { QUICKSTART_TILES } from "./types";

export function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="empty">
      <div className="empty-mark">
        <SMark size={88} />
      </div>
      <div className="empty-title">
        ask the <span className="accent">swarm</span> anything that lives on Somnia.
      </div>
      <div className="empty-sub">
        &gt; investigations are powered by real on-chain agents (English / русский / any language).
        each reply ships with verifiable receipts and a flat cost in STT.
      </div>
      <div className="quickstart">
        {QUICKSTART_TILES.map((t) => (
          <button
            key={t.cmd}
            type="button"
            className="quickstart-tile"
            onClick={() => onPick(t.ex)}
          >
            <span className="icon">
              {t.icon}&nbsp;&nbsp;{t.cmd}
            </span>
            <span className="name">{t.name}</span>
            <span className="ex">{t.hint}</span>
            <span className="ex" style={{ color: "var(--fg-mute)", marginTop: 4 }}>
              &gt; {t.ex}
            </span>
          </button>
        ))}
      </div>
      <div className="quickstart-foot">
        // your first question costs <span className="v">≈ 1.80 STT</span> · escrow credit shown above ·
        receipts visible at <span className="v">agents.testnet.somnia.network</span>
      </div>
    </div>
  );
}
