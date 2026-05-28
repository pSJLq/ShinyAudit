"use client";

/**
 * Live polling of `SomniaAgents.getRequest(requestId)` while a step is running.
 *
 * Shows what the subcommittee is doing in real time:
 *   - how many validators responded (out of subcommitteeSize)
 *   - which ones succeeded / failed / timed out
 *   - response receipts as they come in
 *   - block-since-dispatch counter
 *
 * Polls every 3s. Stops as soon as the parent flips the step out of "running".
 */

import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { somniaTestnet } from "@/lib/somnia/chains";
import { PLATFORM_ABI, NETWORKS } from "@/lib/somnia/agents";

interface ValidatorResponse {
  validator: `0x${string}`;
  status: number;        // 0=None, 1=Pending, 2=Success, 3=Failed, 4=TimedOut
  receipt: bigint;
  executionCost: bigint;
}

interface RequestState {
  responseCount: bigint;
  failureCount: bigint;
  threshold: bigint;
  deadline: bigint;
  status: number;
  remainingBudget: bigint;
  responses: ValidatorResponse[];
}

interface Props {
  requestId: string;
  active: boolean;
}

const STATUS_NAME = ["—", "pending", "success", "failed", "timeout"];
const STATUS_COLOR: Record<string, string> = {
  pending: "var(--blue)",
  success: "var(--lime)",
  failed:  "var(--red)",
  timeout: "var(--amber)",
  "—":     "var(--fg-faint)"
};

const PLATFORM = NETWORKS.testnet.contracts.SomniaAgents;
const SUBCOMMITTEE_SIZE = 3;

export function LiveRequestStatus({ requestId, active }: Props) {
  const publicClient = usePublicClient({ chainId: somniaTestnet.id });
  const [state, setState] = useState<RequestState | null>(null);
  const [currentBlock, setCurrentBlock] = useState<bigint | null>(null);
  const [createdBlock, setCreatedBlock] = useState<bigint | null>(null);
  const [cleared, setCleared] = useState(false);
  const [pollErrors, setPollErrors] = useState(0);

  useEffect(() => {
    if (!active || !publicClient || !requestId) return;
    let cancelled = false;
    const rid = BigInt(requestId);

    async function poll() {
      try {
        const head = await publicClient!.getBlockNumber();
        if (cancelled) return;
        setCurrentBlock(head);
        try {
          const req = (await publicClient!.readContract({
            address: PLATFORM,
            abi: PLATFORM_ABI,
            functionName: "getRequest",
            args: [rid]
          })) as RequestState;
          if (cancelled) return;
          setState(req);
          setPollErrors(0);
        } catch (err) {
          const msg = (err as Error).message || "";
          if (msg.includes("RequestNotFound") || msg.includes("reverted")) {
            // slot zeroed → request finalised + cleared on-chain
            if (!cancelled) setCleared(true);
          } else {
            if (!cancelled) setPollErrors((n) => n + 1);
          }
        }
        if (createdBlock === null && state && Number(state.responseCount) === 0) {
          // not yet started — keep watching head
        }
      } catch {
        /* network blip */
      }
    }

    void poll();
    const id = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [active, publicClient, requestId, createdBlock, state]);

  if (cleared) {
    return (
      <div className="live-req cleared">
        <div className="lr-head">
          <span className="lr-label">// live · subcommittee on-chain state</span>
          <span style={{ color: "var(--amber)" }}>
            ⚠ request slot cleared on-chain — server may have missed the finalise event ·
            press <strong style={{ color: "var(--red)" }}>×</strong> to abort and retry
          </span>
        </div>
      </div>
    );
  }

  if (pollErrors > 5) {
    return (
      <div className="live-req">
        <div className="lr-head">
          <span className="lr-label">// live · subcommittee</span>
          <span style={{ color: "var(--fg-faint)" }}>RPC unreachable · {pollErrors} consecutive errors</span>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="live-req">
        <div className="lr-head">
          <span className="lr-label">// live · subcommittee</span>
          <span style={{ color: "var(--fg-faint)" }}>fetching state…</span>
        </div>
      </div>
    );
  }

  const responded = Number(state.responseCount);
  const failed = Number(state.failureCount);
  const threshold = Number(state.threshold) || Math.ceil(SUBCOMMITTEE_SIZE / 2);
  const deadlineSec = Number(state.deadline) - Math.floor(Date.now() / 1000);
  const blocksElapsed =
    currentBlock !== null && createdBlock !== null ? Number(currentBlock - createdBlock) : null;

  const slots: Array<ValidatorResponse | null> = [];
  for (let i = 0; i < SUBCOMMITTEE_SIZE; i++) slots.push(state.responses?.[i] ?? null);

  return (
    <div className="live-req">
      <div className="lr-head">
        <span className="lr-label">// live · subcommittee on-chain state</span>
        <span className="lr-counter">
          <span style={{ color: "var(--fg)" }}>{responded}</span>
          <span style={{ color: "var(--fg-faint)" }}> / {SUBCOMMITTEE_SIZE}</span>
          <span style={{ color: "var(--fg-faint)" }}> responded</span>
          {failed > 0 && (
            <span style={{ color: "var(--red)", marginLeft: 8 }}>· {failed} failed</span>
          )}
        </span>
      </div>
      <div className="lr-slots">
        {slots.map((r, i) => {
          const stName = r ? STATUS_NAME[r.status] ?? "—" : "—";
          const color = STATUS_COLOR[stName] || "var(--fg-faint)";
          return (
            <div key={i} className={"lr-slot " + (r ? stName : "empty")}>
              <span className="lr-idx">v{i + 1}</span>
              <span className="lr-st" style={{ color }}>
                {r ? stName : "waiting"}
              </span>
              {r && r.receipt > 0n && (
                <span className="lr-receipt">receipt #{r.receipt.toString().slice(0, 8)}…</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="lr-meta">
        <span>
          threshold: <span style={{ color: "var(--blue)" }}>{threshold}</span>
        </span>
        <span>·</span>
        {deadlineSec > 0 ? (
          <span>
            timeout in <span style={{ color: deadlineSec < 60 ? "var(--amber)" : "var(--blue)" }}>{deadlineSec}s</span>
          </span>
        ) : (
          <span style={{ color: "var(--red)" }}>past deadline · awaiting finalise</span>
        )}
        {blocksElapsed !== null && (
          <>
            <span>·</span>
            <span>{blocksElapsed} blocks elapsed</span>
          </>
        )}
      </div>
    </div>
  );
}
