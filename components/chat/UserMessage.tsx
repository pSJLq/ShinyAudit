"use client";

import type { UserMsg } from "./types";

function short(a: string) {
  return a.length < 12 ? a : `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function UserMessage({ msg }: { msg: UserMsg }) {
  return (
    <div className="msg-user">
      <div className="bubble">{msg.text}</div>
      <div className="chips">
        {msg.target && (
          <span className="chip">
            <span className="k">target ::</span> {msg.target.kind} {short(msg.target.addr)}
          </span>
        )}
        {msg.qtype && (
          <span className="chip qtype">
            <span className="k">type ::</span> {msg.qtype}
          </span>
        )}
        {msg.costEst != null && (
          <span className="chip">
            <span className="k">est ::</span> {msg.costEst.toFixed(2)} STT
          </span>
        )}
      </div>
    </div>
  );
}
