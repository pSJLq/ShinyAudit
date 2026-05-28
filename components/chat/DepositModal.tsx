"use client";

import { useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { parseEther } from "viem";
import { ESCROW_ABI, ESCROW_ADDRESS } from "@/lib/somnia/escrow";
import { somniaTestnet } from "@/lib/somnia/chains";

interface Props {
  onClose: () => void;
  onSuccess?: () => void;
}

export function DepositModal({ onClose, onSuccess }: Props) {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: somniaTestnet.id });
  const { data: walletClient } = useWalletClient({ chainId: somniaTestnet.id });
  const [amount, setAmount] = useState("3.0");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [tx, setTx] = useState<`0x${string}` | null>(null);

  async function onDeposit() {
    if (!walletClient || !address || !publicClient) return;
    setBusy(true);
    setMsg(null);
    try {
      const value = parseEther(amount);
      const hash = await walletClient.writeContract({
        address: ESCROW_ADDRESS,
        abi: ESCROW_ABI,
        functionName: "deposit",
        args: [],
        value,
        chain: somniaTestnet,
        account: address
      });
      setTx(hash);
      setMsg(`tx submitted · waiting for confirmation…`);
      await publicClient.waitForTransactionReceipt({ hash });
      setMsg(`✓ ${amount} STT credited to your escrow`);
      onSuccess?.();
      setTimeout(onClose, 1400);
    } catch (err) {
      setMsg(`failed: ${(err as Error).message.slice(0, 200)}`);
    } finally {
      setBusy(false);
    }
  }

  async function onRefund() {
    if (!walletClient || !address || !publicClient) return;
    setBusy(true);
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
      setTx(hash);
      setMsg(`refund tx submitted…`);
      await publicClient.waitForTransactionReceipt({ hash });
      setMsg(`✓ unused credit returned to your wallet`);
      onSuccess?.();
      setTimeout(onClose, 1400);
    } catch (err) {
      setMsg(`failed: ${(err as Error).message.slice(0, 200)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="deposit-modal-bg" onClick={onClose}>
      <div className="deposit-modal" onClick={(e) => e.stopPropagation()}>
        <h3>
          <span className="pre">&gt;</span> top up escrow credit
        </h3>
        <p>
          one transaction pre-funds many swarm dispatches. credit lives in the ShinyAuditEscrow contract on Somnia
          testnet and can be refunded at any time.
        </p>

        <div className="input">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="3.0"
            inputMode="decimal"
            disabled={busy}
          />
          <span className="sym">STT</span>
        </div>

        {msg && (
          <div className="msg">
            {tx ? (
              <a
                href={`${somniaTestnet.blockExplorers.default.url}/tx/${tx}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {msg}
              </a>
            ) : (
              msg
            )}
          </div>
        )}

        <div className="actions">
          <button type="button" onClick={onRefund} disabled={busy}>
            refund all
          </button>
          <button type="button" onClick={onClose} disabled={busy}>
            cancel
          </button>
          <button type="button" className="primary" onClick={onDeposit} disabled={busy || !amount}>
            {busy ? "submitting…" : `deposit ${amount} STT`}
          </button>
        </div>
      </div>
    </div>
  );
}
