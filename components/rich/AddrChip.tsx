"use client";

import { somniaTestnet } from "@/lib/somnia/chains";

export function AddrChip({ addr }: { addr: string }) {
  const isTx = /^0x[a-fA-F0-9]{64}$/.test(addr);
  const path = isTx ? "tx" : "address";
  const explorer = somniaTestnet.blockExplorers.default.url;
  const display = isTx ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : `${addr.slice(0, 6)}…${addr.slice(-4)}`;
  return (
    <a href={`${explorer}/${path}/${addr}`} target="_blank" rel="noopener noreferrer" className="addr-chip">
      <span style={{ opacity: 0.5 }}>{isTx ? "tx" : "0x"}</span>
      {display.replace(/^0x/, "")}
    </a>
  );
}

const ADDR_RE = /(0x[a-fA-F0-9]{40}|0x[a-fA-F0-9]{64})/g;

/** Wraps any inline 0x… in an AddrChip. */
export function autoChip(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  ADDR_RE.lastIndex = 0;
  while ((m = ADDR_RE.exec(text)) !== null) {
    if (m.index > lastIndex) parts.push(text.slice(lastIndex, m.index));
    parts.push(<AddrChip key={`${m.index}-${m[0]}`} addr={m[0]} />);
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}
