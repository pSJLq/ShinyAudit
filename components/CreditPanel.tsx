"use client";

/**
 * Pre-funded credit panel for the user.
 *
 * Shows current credit on ShinyAuditEscrow, exposes one-click deposit (in STT)
 * and a refund button. One MetaMask popup pays for many subsequent dispatch
 * steps — orchestrator drains credit on the user's behalf via dispatchFor().
 */

import { useState } from "react";
import { useAccount, useBalance, usePublicClient, useWalletClient } from "wagmi";
import { formatEther, parseEther } from "viem";
import { ESCROW_ABI, ESCROW_ADDRESS, quoteEscrow } from "@/lib/somnia/escrow";
import { somniaTestnet } from "@/lib/somnia/chains";

interface Props {
  /** Estimated total deposit needed for the planned swarm (in STT, decimal string). */
  estimatedTotalSTT?: number;
  onCreditChanged?: (balance: bigint) => void;
}

export function CreditPanel({ estimatedTotalSTT, onCreditChanged }: Props) {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: somniaTestnet.id });
  const { data: walletClient } = useWalletClient({ chainId: somniaTestnet.id });
  const { data: walletBalance, refetch: refetchBalance } = useBalance({
    address,
    chainId: somniaTestnet.id,
    query: { enabled: isConnected }
  });

  const [credit, setCredit] = useState<bigint | null>(null);
  const [depositAmount, setDepositAmount] = useState("1.0");
  const [busy, setBusy] = useState<"deposit" | "refund" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<`0x${string}` | null>(null);

  async function refresh() {
    if (!address || !publicClient) return;
    try {
      const c = (await publicClient.readContract({
        address: ESCROW_ADDRESS,
        abi: ESCROW_ABI,
        functionName: "credits",
        args: [address]
      })) as bigint;
      setCredit(c);
      onCreditChanged?.(c);
    } catch (err) {
      console.warn("credits read failed", err);
    }
  }

  // initial + on connect
  if (isConnected && credit === null) {
    refresh();
  }

  async function onDeposit() {
    if (!walletClient || !address) return;
    setBusy("deposit");
    setMsg(null);
    try {
      const value = parseEther(depositAmount);
      const hash = await walletClient.writeContract({
        address: ESCROW_ADDRESS,
        abi: ESCROW_ABI,
        functionName: "deposit",
        args: [],
        value,
        chain: somniaTestnet,
        account: address
      });
      setLastTx(hash);
      setMsg(`deposit tx submitted: ${shortHash(hash)}`);
      await publicClient!.waitForTransactionReceipt({ hash });
      setMsg(`deposit confirmed (${depositAmount} STT credited)`);
      await refresh();
      await refetchBalance();
    } catch (err) {
      setMsg(`deposit failed: ${(err as Error).message.slice(0, 200)}`);
    } finally {
      setBusy(null);
    }
  }

  async function onRefund() {
    if (!walletClient || !address || !credit || credit === 0n) return;
    setBusy("refund");
    setMsg(null);
    try {
      const hash = await walletClient.writeContract({
        address: ESCROW_ADDRESS,
        abi: ESCROW_ABI,
        functionName: "refund",
        args: [],
        chain: somniaTestnet,
        account: address
      });
      setLastTx(hash);
      setMsg(`refund tx submitted: ${shortHash(hash)}`);
      await publicClient!.waitForTransactionReceipt({ hash });
      setMsg(`refund confirmed (${formatEther(credit)} STT returned)`);
      await refresh();
      await refetchBalance();
    } catch (err) {
      setMsg(`refund failed: ${(err as Error).message.slice(0, 200)}`);
    } finally {
      setBusy(null);
    }
  }

  const need = estimatedTotalSTT ? parseEther(estimatedTotalSTT.toFixed(6)) : 0n;
  const hasEnough = credit !== null && credit >= need;

  return (
    <div
      style={{
        border: "1px solid var(--border-subtle)",
        background: "var(--bg-raised)",
        padding: 18,
        marginTop: 18,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 24,
        alignItems: "center"
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 11, color: "var(--ink-muted)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
          <span style={{ color: "var(--violet)" }}>▸</span> your escrow credit
        </div>
        <div style={{ fontSize: 22, color: "var(--ink-primary)" }}>
          {credit !== null ? formatEther(credit) : "—"}{" "}
          <span style={{ color: "var(--blue)", fontSize: 14 }}>STT</span>
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-muted)" }}>
          wallet balance:{" "}
          <span style={{ color: "var(--blue)" }}>
            {walletBalance ? `${Number(walletBalance.formatted).toFixed(4)} ${walletBalance.symbol}` : "—"}
          </span>
        </div>
        {estimatedTotalSTT !== undefined && (
          <div style={{ fontSize: 11, color: hasEnough ? "var(--lime)" : "var(--amber)" }}>
            swarm needs ~{estimatedTotalSTT.toFixed(4)} STT · {hasEnough ? "ready" : "top up to dispatch"}
          </div>
        )}
        <div style={{ fontSize: 10, color: "var(--ink-muted)", marginTop: 6 }}>
          escrow{" "}
          <a
            href={`${somniaTestnet.blockExplorers.default.url}/address/${ESCROW_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--violet)" }}
          >
            {ESCROW_ADDRESS.slice(0, 8)}…{ESCROW_ADDRESS.slice(-6)}
          </a>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "stretch" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
          <div className="target-picker" style={{ flex: 1, minWidth: 0 }}>
            <span className="target-type">STT</span>
            <input
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="1.0"
              inputMode="decimal"
            />
          </div>
          <button
            className="btn btn--sm"
            onClick={onDeposit}
            disabled={!isConnected || busy !== null || !depositAmount}
            style={{ whiteSpace: "nowrap" }}
          >
            <span>&gt;</span> {busy === "deposit" ? "depositing…" : "deposit"}
          </button>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn--ghost"
            onClick={onRefund}
            disabled={!isConnected || busy !== null || !credit || credit === 0n}
            style={{ fontSize: 12 }}
          >
            {busy === "refund" ? "refunding…" : "refund credit"}
          </button>
          <button className="btn--ghost" onClick={() => refresh()} disabled={busy !== null} style={{ fontSize: 12 }}>
            refresh
          </button>
        </div>
        {msg && (
          <div style={{ fontSize: 11, color: "var(--ink-secondary)", marginTop: 4 }}>
            {lastTx ? (
              <a
                href={`${somniaTestnet.blockExplorers.default.url}/tx/${lastTx}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--violet)" }}
              >
                {msg}
              </a>
            ) : (
              msg
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function shortHash(h: string): string {
  return `${h.slice(0, 6)}…${h.slice(-4)}`;
}
