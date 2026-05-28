"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, usePublicClient } from "wagmi";
import { SMark } from "./SMark";
import { LiveBlockTicker } from "./LiveBlockTicker";
import { ESCROW_ABI, ESCROW_ADDRESS } from "@/lib/somnia/escrow";
import { somniaTestnet } from "@/lib/somnia/chains";

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function ChatNav() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const publicClient = usePublicClient({ chainId: somniaTestnet.id });
  const [isOwner, setIsOwner] = useState(false);

  const injected = connectors.find((c) => c.id === "injected") ?? connectors[0];

  // Detect if connected wallet is the escrow owner → show admin link
  useEffect(() => {
    if (!address || !publicClient) {
      setIsOwner(false);
      return;
    }
    void (async () => {
      try {
        const owner = (await publicClient.readContract({
          address: ESCROW_ADDRESS,
          abi: ESCROW_ABI,
          functionName: "owner"
        })) as `0x${string}`;
        setIsOwner(owner.toLowerCase() === address.toLowerCase());
      } catch {
        setIsOwner(false);
      }
    })();
  }, [address, publicClient]);

  return (
    <nav className="topnav">
      <div className="topnav-left">
        <div className="brand">
          <SMark size={30} />
          <span className="brand-name">hinyAudit</span>
          <span className="brand-tag">// on-chain investigator</span>
        </div>
        <div className="topnav-links">
          <a href="/">manifesto</a>
          <a href="/chat" className="active">chat</a>
          <a href="/#swarm">swarm</a>
          <a href="/#capabilities">capabilities</a>
          <a href="/#receipts">cost</a>
          <a href="https://docs.somnia.network/agents" target="_blank" rel="noopener noreferrer">docs</a>
          {isOwner && <a href="/admin">admin</a>}
        </div>
      </div>
      <div className="topnav-right">
        <LiveBlockTicker />
        <span className="network-pill">
          <span className="dot"></span> somnia testnet
        </span>
        {isConnected ? (
          <button
            className="wallet-pill"
            onClick={() => disconnect()}
            title="click to disconnect"
            type="button"
          >
            <span>{address ? short(address) : "—"}</span>
            <span style={{ color: "var(--fg-faint)" }}>·</span>
            <span style={{ color: "var(--fg-mute)" }}>connected</span>
          </button>
        ) : (
          <button
            className="wallet-pill outline"
            onClick={() => injected && connect({ connector: injected })}
            disabled={isPending}
            type="button"
          >
            <span>{isPending ? "connecting…" : "connect wallet"}</span>
          </button>
        )}
      </div>
    </nav>
  );
}
