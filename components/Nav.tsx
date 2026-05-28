"use client";

import { useAccount, useBalance, useConnect, useDisconnect } from "wagmi";
import { somniaTestnet } from "@/lib/somnia/chains";

function short(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function Nav() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({
    address,
    chainId: somniaTestnet.id,
    query: { enabled: isConnected }
  });

  const injected = connectors.find((c) => c.id === "injected") ?? connectors[0];

  return (
    <nav className="nav" id="top">
      <div className="nav-inner">
        <a href="#top" className="nav-brand">
          <span className="brand-mark">{"{s}"}</span>
          <span className="brand-word">hinyAudit</span>
        </a>
        <div className="nav-links">
          <a href="#console">&gt; console</a>
          <a href="#swarm">&gt; swarm</a>
          <a href="#capabilities">&gt; docs</a>
          <a href="#receipts">&gt; receipts</a>
        </div>
        <div className="nav-right">
          {!isConnected ? (
            <button
              className="btn btn--sm"
              onClick={() => injected && connect({ connector: injected })}
              disabled={isPending}
            >
              <span>&gt;</span> {isPending ? "connecting…" : "connect wallet"}
            </button>
          ) : (
            <button className="wallet-pill" onClick={() => disconnect()} title="click to disconnect">
              <span className="dot pulse" />
              <span className="num">{address ? short(address) : "—"}</span>
              <span className="sep">·</span>
              <span className="num" style={{ color: "var(--blue)" }}>
                {balance ? `${Number(balance.formatted).toFixed(2)} ${balance.symbol}` : "— STT"}
              </span>
            </button>
          )}
        </div>
      </div>
      <div className="hairline" />
    </nav>
  );
}
