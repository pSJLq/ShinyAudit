"use client";

import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { somniaTestnet } from "@/lib/somnia/chains";

/**
 * Live Somnia block number ticker — proves to the user the chain is alive.
 * Polls getBlockNumber every 2 seconds.
 */
export function LiveBlockTicker() {
  const publicClient = usePublicClient({ chainId: somniaTestnet.id });
  const [block, setBlock] = useState<bigint | null>(null);
  const [prevBlock, setPrevBlock] = useState<bigint | null>(null);

  useEffect(() => {
    if (!publicClient) return;
    let cancelled = false;
    async function tick() {
      try {
        const b = await publicClient!.getBlockNumber();
        if (cancelled) return;
        setBlock((prev) => {
          if (prev !== b) setPrevBlock(prev);
          return b;
        });
      } catch {
        /* swallow */
      }
    }
    tick();
    const id = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [publicClient]);

  const ticked = prevBlock !== null && block !== null && block > prevBlock;

  return (
    <span className="live-block" title="Somnia testnet head block">
      <span className="lb-label">block</span>
      <span className={"lb-num" + (ticked ? " ticked" : "")}>
        {block !== null ? block.toString() : "—"}
      </span>
    </span>
  );
}
