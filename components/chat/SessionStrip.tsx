"use client";

import { useAccount } from "wagmi";
import type { ChatSession } from "./types";

interface Props {
  session: ChatSession;
  onNew: () => void;
  onOpenDeposit: () => void;
  onDownload: () => void;
  onShare: () => void;
}

/**
 * Session header strip — purely presentational. The live credit value lives in
 * the parent's session state (refreshed via `Chat.refreshCredit`).
 */
export function SessionStrip({ session, onNew, onOpenDeposit, onDownload, onShare }: Props) {
  const { isConnected } = useAccount();

  const credit = session.credit;
  const lastReply = session.lastReply || 0.001;
  const remainingTurns = Math.floor(credit / Math.max(lastReply, 0.5));
  const pct = Math.min(100, (credit / 30) * 100);

  return (
    <div className="session-strip">
      <div className="session-row-1">
        <div className="session-id">
          <span className="pre">&gt;&nbsp;session</span>
          <span className="id">{session.id}</span>
          <span className="meta">
            // {session.turns} turn{session.turns === 1 ? "" : "s"} · started {session.startedAt}
          </span>
        </div>
        <div className="session-actions">
          <button className="btn-mini" type="button" onClick={onNew}>
            <span className="key">[+]</span> new session
          </button>
          <button className="btn-mini" type="button" onClick={onDownload} disabled={session.turns === 0}>
            <span className="key">[↓]</span> download .md
          </button>
          <button className="btn-mini" type="button" onClick={onShare} disabled={session.turns === 0}>
            <span className="key">[↗]</span> share read-only
          </button>
        </div>
      </div>
      <div className="credit-bar">
        <span className="label">credit</span>
        <span className="value">
          <strong>{credit.toFixed(3)}</strong> STT
        </span>
        <div className="meter">
          <div className="meter-fill" style={{ width: `${pct}%` }} />
        </div>
        <button className="topup" type="button" onClick={onOpenDeposit}>
          + top up
        </button>
        <span className="sep">|</span>
        <span className="label">last reply</span>
        <span className="value">{session.lastReply.toFixed(2)} STT</span>
        <span className="sep">|</span>
        <span className="label">session total</span>
        <span className="value">{session.sessionTotal.toFixed(3)} STT</span>
        <span className="sep">|</span>
        <span className="label">
          est ≈ {isConnected ? remainingTurns : "—"} more turn{remainingTurns === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}
