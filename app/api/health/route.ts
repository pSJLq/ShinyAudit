/**
 * /api/health — pre-flight self-test.
 *
 * Probes everything an investigation needs BEFORE the user spends STT:
 *   • Somnia RPC reachable
 *   • Platform contract responsive (getRequestDeposit)
 *   • Escrow contract: orchestrator() returns OUR signer address
 *   • Encoded inferString payload size for an audit-intent planner
 *   • Receipts API reachable
 *
 * Returns 200 with { ok: true, checks: {...} } on success, or 200 with
 * { ok: false, checks: {...} } when one or more probes fail. UI surfaces
 * a green/amber/red dot based on this.
 *
 * Intentionally never reveals server secrets (no PRIVATE_KEY in response).
 */

import { formatEther } from "viem";
import { publicClient, getOrchestratorWallet } from "@/lib/somnia/server";
import { PLATFORM_ADDRESS, RECEIPTS_BASE_URL, ACTIVE_NETWORK } from "@/lib/somnia/chains";
import { ESCROW_ADDRESS, ESCROW_ABI } from "@/lib/somnia/escrow";
import { PLATFORM_ABI, encodeInferString } from "@/lib/somnia/agents";
import { renderPlannerSystemFor } from "@/lib/somnia/orchestrator";

// Minimum STT the orchestrator wallet must hold to safely sign ~10 txs of
// dispatchFor (each costs up to gas:2.5M × gasPrice). 0.5 STT is enough for
// roughly a hundred dispatchFor calls on Somnia testnet.
const ORCHESTRATOR_MIN_STT_WEI = 500_000_000_000_000_000n; // 0.5 STT

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Probe {
  name: string;
  ok: boolean;
  ms: number;
  detail: string;
}

async function timed<T>(name: string, fn: () => Promise<T>): Promise<{ ok: boolean; ms: number; detail: string; value?: T }> {
  const t = Date.now();
  try {
    const value = await fn();
    return { ok: true, ms: Date.now() - t, detail: "ok", value };
  } catch (e) {
    return { ok: false, ms: Date.now() - t, detail: (e as Error).message.slice(0, 160) };
  }
}

export async function GET() {
  const checks: Probe[] = [];

  const rpc = await timed("rpc.getBlockNumber", () => publicClient.getBlockNumber());
  checks.push({
    name: "rpc",
    ok: rpc.ok,
    ms: rpc.ms,
    detail: rpc.ok ? `block ${rpc.value}` : rpc.detail
  });

  const reserve = await timed("platform.getRequestDeposit", () =>
    publicClient.readContract({
      address: PLATFORM_ADDRESS,
      abi: PLATFORM_ABI,
      functionName: "getRequestDeposit"
    })
  );
  checks.push({
    name: "platform",
    ok: reserve.ok,
    ms: reserve.ms,
    detail: reserve.ok ? `reserve=${reserve.value} wei` : reserve.detail
  });

  // Confirm escrow.orchestrator() == server signer. If not, ALL dispatchFor
  // calls will revert with onlyOrchestrator — a silent failure mode that
  // wastes tx fees if not surfaced.
  const orch = await timed("escrow.orchestrator", async () => {
    const expected = (await publicClient.readContract({
      address: ESCROW_ADDRESS,
      abi: ESCROW_ABI,
      functionName: "orchestrator"
    })) as string;
    let serverSigner = "(unset)";
    try {
      serverSigner = getOrchestratorWallet().account.address;
    } catch {
      // PRIVATE_KEY missing — that's a fail but we don't leak the env error
    }
    const match = serverSigner.toLowerCase() === expected.toLowerCase();
    return { expected, serverSigner, match };
  });
  checks.push({
    name: "escrow-signer-match",
    ok: orch.ok && (orch.value?.match ?? false),
    ms: orch.ms,
    detail: orch.ok
      ? orch.value!.match
        ? `signer matches (${orch.value!.expected.slice(0, 10)}…)`
        : `MISMATCH expected=${orch.value!.expected} signer=${orch.value!.serverSigner}`
      : orch.detail
  });

  // Orchestrator EOA needs STT to pay gas for every dispatchFor it signs.
  // If this drops to 0, txs broadcast but revert out-of-gas with no logs,
  // which historically surfaced to users as the cryptic "RequestCreated
  // event missing" — that was a symptom, this check is the root-cause guard.
  const orchBal = await timed("orchestrator-balance", async () => {
    const addr = getOrchestratorWallet().account.address;
    const bal = await publicClient.getBalance({ address: addr });
    return { addr, bal };
  });
  checks.push({
    name: "orchestrator-gas",
    ok: orchBal.ok && (orchBal.value?.bal ?? 0n) >= ORCHESTRATOR_MIN_STT_WEI,
    ms: orchBal.ms,
    detail: orchBal.ok
      ? (orchBal.value!.bal >= ORCHESTRATOR_MIN_STT_WEI
          ? `${formatEther(orchBal.value!.bal)} STT (above 0.5 floor)`
          : `LOW: only ${formatEther(orchBal.value!.bal)} STT — top up ${orchBal.value!.addr} or every dispatchFor will revert out-of-gas`)
      : orchBal.detail
  });

  // Escrow must hold ≥ sum(user credits) so it can actually forward
  // agentDeposit to platform.createRequest on each dispatch.
  const escrowBal = await timed("escrow-balance", async () => {
    const bal = await publicClient.getBalance({ address: ESCROW_ADDRESS });
    return bal;
  });
  checks.push({
    name: "escrow-funded",
    ok: escrowBal.ok && (escrowBal.value ?? 0n) > 0n,
    ms: escrowBal.ms,
    detail: escrowBal.ok
      ? `${formatEther(escrowBal.value!)} STT held`
      : escrowBal.detail
  });

  // Synthetic planner payload size — confirms the system prompt fits in one tx.
  let plannerHexBytes = 0;
  try {
    const sys = renderPlannerSystemFor("test prompt", "0x0000000000000000000000000000000000000000", "audit");
    const hex = encodeInferString({ prompt: "ping", system: sys, chainOfThought: true });
    plannerHexBytes = (hex.length - 2) / 2;
  } catch (e) {
    /* never */
  }
  checks.push({
    name: "planner-payload-fits",
    ok: plannerHexBytes > 0 && plannerHexBytes < 16_000,
    ms: 0,
    detail: `${plannerHexBytes} bytes (budget 16 KB)`
  });

  const receipts = await timed("receipts-api", async () => {
    const res = await fetch(`${RECEIPTS_BASE_URL}/`, { method: "GET", cache: "no-store" });
    return res.status;
  });
  checks.push({
    name: "receipts",
    ok: receipts.ok && Number(receipts.value) < 500,
    ms: receipts.ms,
    detail: receipts.ok ? `HTTP ${receipts.value}` : receipts.detail
  });

  const ok = checks.every((c) => c.ok);
  return new Response(
    JSON.stringify({ ok, network: ACTIVE_NETWORK.network, chainId: ACTIVE_NETWORK.chainId, checks }, null, 2),
    {
      status: 200,
      headers: { "content-type": "application/json" }
    }
  );
}
