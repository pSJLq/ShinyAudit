"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SLASH_COMMANDS } from "./types";
import type { ChatSession } from "./types";

interface SendPayload {
  text: string;
  target: { kind: string; addr: string } | null;
  qtype: string | null;
  costEst: number | null;
}

interface Props {
  disabled: boolean;
  isConnected: boolean;
  onSend: (p: SendPayload) => void;
  onAbort?: () => void;
  session: ChatSession;
}

function short(a: string) {
  return a.length < 12 ? a : `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function Composer({ disabled, isConnected, onSend, onAbort, session }: Props) {
  const [text, setText] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  // auto-resize
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(220, ta.scrollHeight) + "px";
  }, [text]);

  // slash menu
  const showSlash = text.startsWith("/") && !text.includes(" ");
  const slashFiltered = useMemo(() => {
    if (!showSlash) return [];
    const q = text.toLowerCase();
    return SLASH_COMMANDS.filter((c) => c.cmd.startsWith(q));
  }, [text, showSlash]);

  // target detection
  const target = useMemo(() => {
    const addrMatch = text.match(/0x[a-fA-F0-9]{40,64}/);
    if (!addrMatch) return null;
    const a = addrMatch[0];
    const lower = text.toLowerCase();
    let kind = "address";
    if (lower.includes("/audit")) kind = "contract";
    else if (lower.includes("/profile") || lower.includes("/trace")) kind = "wallet";
    else if (lower.includes("/xray") || lower.includes("token")) kind = "token";
    else if (a.length === 66) kind = "tx";
    return { kind, addr: a };
  }, [text]);

  const qtype = useMemo(() => {
    const t = text.trim().toLowerCase();
    if (t.startsWith("/audit"))   return "audit";
    if (t.startsWith("/profile")) return "profile";
    if (t.startsWith("/trace"))   return "trace";
    if (t.startsWith("/xray"))    return "x-ray";
    if (t.startsWith("/watch"))   return "watch";
    if (t.startsWith("/stealth")) return "stealth";
    return null;
  }, [text]);

  const costEst = useMemo(() => {
    const t = text.trim();
    if (!t) return null;
    let base = 0.6;
    if (qtype === "audit")   base = 1.85;
    if (qtype === "trace")   base = 2.10;
    if (qtype === "profile") base = 1.51;
    if (qtype === "x-ray")   base = 1.32;
    if (qtype === "stealth") base = 2.40;
    if (qtype === "watch")   base = 0.40;
    return base + t.length / 600;
  }, [text, qtype]);

  const insufficient = costEst != null && costEst > session.credit;
  const canSend = isConnected && text.trim().length > 0 && !disabled && !insufficient;

  const handleSend = () => {
    if (!canSend) return;
    onSend({ text: text.trim(), target, qtype, costEst });
    setText("");
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const pickSlash = (cmd: string) => {
    setText(cmd + " ");
    setTimeout(() => taRef.current?.focus(), 0);
  };

  const placeholder = disabled
    ? "swarm executing… composer locked"
    : !isConnected
      ? "> connect wallet to start an investigation"
      : "> ask the swarm anything, any language · paste an address or just describe the target · use / for canned flows";

  return (
    <div className="composer-wrap">
      <div className="composer">
        {showSlash && slashFiltered.length > 0 && (
          <div className="slash-menu">
            {slashFiltered.map((s) => (
              <button key={s.cmd} type="button" className="slash-item" onClick={() => pickSlash(s.cmd)}>
                <span className="cmd">{s.cmd}</span>
                <span className="desc">{s.desc}</span>
                <span className="ex">&gt; {s.cmd} {s.ex}</span>
              </button>
            ))}
          </div>
        )}

        {(target || qtype) && (
          <div className="composer-chips">
            {target && (
              <span className="target-chip">
                {target.kind} :: {short(target.addr)}
                <span className="x" title="auto-detected target">·</span>
              </span>
            )}
            {qtype && (
              <span
                className="target-chip"
                style={{ background: "rgba(110,110,237,0.10)", borderColor: "rgba(110,110,237,0.4)" }}
              >
                type :: {qtype}
              </span>
            )}
            <span style={{ marginLeft: "auto" }}>// auto-detected from prompt</span>
          </div>
        )}

        <div className="composer-main">
          <textarea
            ref={taRef}
            className="composer-textarea"
            placeholder={placeholder}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKey}
            disabled={disabled || !isConnected}
          />
          <div className="composer-actions">
            <div className={"composer-cost " + (insufficient ? "insufficient" : "")}>
              {costEst != null ? (
                <>
                  ≈ <span className="v">{costEst.toFixed(2)} STT</span>
                  <br />
                  {insufficient ? "insufficient credit" : "for this question"}
                </>
              ) : (
                <span style={{ color: "var(--fg-faint)" }}>// no cost yet</span>
              )}
            </div>
            {disabled && onAbort ? (
              <button
                type="button"
                className="send-btn"
                onClick={onAbort}
                title="abort current investigation"
                style={{ background: "var(--red)" }}
              >
                ×
              </button>
            ) : (
              <button
                type="button"
                className="send-btn"
                onClick={handleSend}
                disabled={!canSend}
                title="send (⏎)"
              >
                ↵
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="composer-hint">
        <span>
          <span className="kbd">/</span> commands &nbsp;
          <span className="kbd">⏎</span> send &nbsp;
          <span className="kbd">⇧⏎</span> newline &nbsp;
          <span className="kbd">⌘K</span> new session
        </span>
        <span>
          // sessions are local to wallet · sealed receipts on agents.testnet.somnia.network
        </span>
      </div>
    </div>
  );
}
