"use client";

/**
 * /admin — owner-only revenue dashboard.
 *
 * The page is unprotected by route auth (anyone can load it), but every
 * mutating action requires the connected wallet to equal the contract
 * `owner()`. Reads are public anyway — accounting is on-chain.
 */

import { useEffect, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { formatEther, parseEther } from "viem";
import { ESCROW_ABI, ESCROW_ADDRESS } from "@/lib/somnia/escrow";
import { somniaTestnet } from "@/lib/somnia/chains";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";

interface State {
  owner: `0x${string}` | null;
  orchestrator: `0x${string}` | null;
  contractBalance: bigint | null;
  totalUserCredits: bigint | null;
  revenueEarned: bigint | null;
  revenueWithdrawn: bigint | null;
  withdrawable: bigint | null;
}

const EMPTY: State = {
  owner: null,
  orchestrator: null,
  contractBalance: null,
  totalUserCredits: null,
  revenueEarned: null,
  revenueWithdrawn: null,
  withdrawable: null
};

export default function AdminPage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: somniaTestnet.id });
  const { data: walletClient } = useWalletClient({ chainId: somniaTestnet.id });

  const [s, setS] = useState<State>(EMPTY);
  const [busy, setBusy] = useState<null | "withdraw" | "withdrawTo">(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<`0x${string}` | null>(null);
  const [target, setTarget] = useState<string>("");
  const [partial, setPartial] = useState<string>("");

  async function refresh() {
    if (!publicClient) return;
    try {
      const [owner, orchestrator, totalUserCredits, revenueEarned, revenueWithdrawn, withdrawable, contractBalance] = await Promise.all([
        publicClient.readContract({ address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: "owner" }) as Promise<`0x${string}`>,
        publicClient.readContract({ address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: "orchestrator" }) as Promise<`0x${string}`>,
        publicClient.readContract({ address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: "totalUserCredits" }) as Promise<bigint>,
        publicClient.readContract({ address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: "revenueEarned" }) as Promise<bigint>,
        publicClient.readContract({ address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: "revenueWithdrawn" }) as Promise<bigint>,
        publicClient.readContract({ address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: "withdrawableRevenue" }) as Promise<bigint>,
        publicClient.getBalance({ address: ESCROW_ADDRESS })
      ]);
      setS({ owner, orchestrator, totalUserCredits, revenueEarned, revenueWithdrawn, withdrawable, contractBalance });
    } catch (err) {
      console.warn("read failed", err);
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 12000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicClient]);

  const isOwner = isConnected && s.owner && address && s.owner.toLowerCase() === address.toLowerCase();

  async function onWithdrawAll() {
    if (!walletClient || !address) return;
    setBusy("withdraw");
    setMsg(null);
    try {
      const hash = await walletClient.writeContract({
        address: ESCROW_ADDRESS,
        abi: ESCROW_ABI,
        functionName: "withdraw",
        args: [],
        chain: somniaTestnet,
        account: address
      });
      setLastTx(hash);
      setMsg(`withdraw tx submitted: ${short(hash)}`);
      await publicClient!.waitForTransactionReceipt({ hash });
      setMsg(`withdraw confirmed`);
      await refresh();
    } catch (err) {
      setMsg(`withdraw failed: ${(err as Error).message.slice(0, 200)}`);
    } finally {
      setBusy(null);
    }
  }

  async function onWithdrawTo() {
    if (!walletClient || !address || !target || !partial) return;
    setBusy("withdrawTo");
    setMsg(null);
    try {
      const amount = parseEther(partial);
      const hash = await walletClient.writeContract({
        address: ESCROW_ADDRESS,
        abi: ESCROW_ABI,
        functionName: "withdrawTo",
        args: [target as `0x${string}`, amount],
        chain: somniaTestnet,
        account: address
      });
      setLastTx(hash);
      setMsg(`withdrawTo submitted: ${short(hash)}`);
      await publicClient!.waitForTransactionReceipt({ hash });
      setMsg(`withdrawTo confirmed`);
      await refresh();
    } catch (err) {
      setMsg(`withdrawTo failed: ${(err as Error).message.slice(0, 200)}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Nav />
      <main className="section" style={{ paddingTop: 80 }}>
        <div className="container-x">
          <div className="section-eyebrow"><span className="bar" /> admin · owner</div>
          <h1 className="section-heading"><span className="prompt">&gt;</span> treasury</h1>

          <div style={{ marginTop: 32, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <Panel title="contract state">
              <Row label="contract"      value={short(ESCROW_ADDRESS)} link={`${somniaTestnet.blockExplorers.default.url}/address/${ESCROW_ADDRESS}`} />
              <Row label="owner"         value={s.owner ? short(s.owner) : "—"} />
              <Row label="orchestrator"  value={s.orchestrator ? short(s.orchestrator) : "—"} />
              <Row label="balance"       value={s.contractBalance !== null ? `${formatEther(s.contractBalance)} STT` : "—"} highlight />
              <Row label="user credits"  value={s.totalUserCredits !== null ? `${formatEther(s.totalUserCredits)} STT` : "—"} />
              <Row label="withdrawable"  value={s.withdrawable !== null ? `${formatEther(s.withdrawable)} STT` : "—"} highlight />
              <Row label="revenue earned"    value={s.revenueEarned !== null ? `${formatEther(s.revenueEarned)} STT` : "—"} />
              <Row label="revenue withdrawn" value={s.revenueWithdrawn !== null ? `${formatEther(s.revenueWithdrawn)} STT` : "—"} />
            </Panel>

            <Panel title={isOwner ? "owner actions" : "owner actions — connect owner wallet"}>
              <button
                className="btn"
                onClick={onWithdrawAll}
                disabled={!isOwner || busy !== null || !s.withdrawable || s.withdrawable === 0n}
                style={{ width: "100%", marginBottom: 12 }}
              >
                <span>&gt;</span> {busy === "withdraw" ? "withdrawing…" : `withdraw all (${s.withdrawable !== null ? formatEther(s.withdrawable) : "—"} STT)`}
              </button>

              <div style={{ borderTop: "1px solid var(--border-subtle)", margin: "16px 0", paddingTop: 16 }}>
                <div style={{ fontSize: 11, color: "var(--ink-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>
                  withdraw partial → custom address
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <input
                    className="target-picker"
                    style={{ display: "block", padding: "10px 12px", fontSize: 12, color: "var(--ink-primary)", border: "1px solid var(--border-subtle)", background: "var(--bg-deep)" }}
                    placeholder="0x… recipient"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                  />
                  <input
                    className="target-picker"
                    style={{ display: "block", padding: "10px 12px", fontSize: 12, color: "var(--ink-primary)", border: "1px solid var(--border-subtle)", background: "var(--bg-deep)" }}
                    placeholder="amount (STT, e.g. 1.5)"
                    value={partial}
                    onChange={(e) => setPartial(e.target.value)}
                    inputMode="decimal"
                  />
                  <button
                    className="btn btn--sm"
                    onClick={onWithdrawTo}
                    disabled={!isOwner || busy !== null || !target || !partial}
                  >
                    <span>&gt;</span> {busy === "withdrawTo" ? "submitting…" : "withdraw partial"}
                  </button>
                </div>
              </div>

              {!isOwner && isConnected && (
                <div style={{ fontSize: 12, color: "var(--amber)", marginTop: 12 }}>
                  connected wallet is not the contract owner
                </div>
              )}
              {!isConnected && (
                <div style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 12 }}>
                  connect the owner wallet via the nav to enable actions
                </div>
              )}
              {msg && (
                <div style={{ marginTop: 14, fontSize: 12, color: "var(--ink-secondary)" }}>
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
            </Panel>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", padding: 24 }}>
      <div style={{ fontSize: 11, color: "var(--ink-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 16 }}>
        <span style={{ color: "var(--violet)" }}>▸</span> {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, highlight, link }: { label: string; value: string; highlight?: boolean; link?: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", padding: "6px 0", borderBottom: "1px solid var(--border-subtle)", fontSize: 13 }}>
      <span style={{ color: "var(--ink-secondary)" }}>{label}</span>
      <span style={{ color: highlight ? "var(--violet)" : "var(--blue)", fontVariantNumeric: "tabular-nums" }}>
        {link ? (
          <a href={link} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", borderBottom: "1px solid transparent" }}>
            {value}
          </a>
        ) : (
          value
        )}
      </span>
    </div>
  );
}

function short(s: string): string {
  if (!s || s.length < 12) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}
