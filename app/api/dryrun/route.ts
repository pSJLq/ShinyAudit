/**
 * /api/dryrun — validate the full planner dispatch flow WITHOUT spending STT.
 *
 * Uses viem's simulateContract against Somnia's platform contract with the
 * orchestrator EOA as the caller. This is exactly the simulation an RPC node
 * runs before accepting a real tx, so any "Missing or invalid parameters"
 * revert that would happen in production will surface here.
 *
 * Returns:
 *   { ok: true,  requestIdSim: "...", payloadBytes: N }   on success
 *   { ok: false, error: "...", payloadBytes: N }          on failure
 *
 * Query params (all optional, sensible defaults for the audit intent):
 *   ?intent=audit  — which planner system to render
 *   ?target=0x...  — target address embedded in the system prompt
 *   ?prompt=...    — user question
 *
 * NOTE: this calls platform.createRequest directly (skipping escrow) — that's
 * deliberate. Escrow adds only a credit check + fee split. If the platform
 * accepts our payload here, dispatchFor will too whenever the user has credit.
 */

import { NextRequest } from "next/server";
import { parseEther } from "viem";
import { publicClient, getOrchestratorWallet } from "@/lib/somnia/server";
import { PLATFORM_ADDRESS } from "@/lib/somnia/chains";
import {
  AGENT_SLUG,
  AGENTS,
  PLATFORM_ABI,
  encodeInferString,
  getAgentId
} from "@/lib/somnia/agents";
import { renderPlannerSystemFor } from "@/lib/somnia/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUBCOMMITTEE_SIZE = 3;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const intent = url.searchParams.get("intent") || "audit";
  const target = url.searchParams.get("target") || "0xb17CE5D7bf4eCa28580368FaD1548C99D5a2545C";
  const userPrompt = url.searchParams.get("prompt") || "Кто владелец этого казино?";

  const sys = renderPlannerSystemFor(userPrompt, target, intent);
  const payload = encodeInferString({
    prompt: `Target: ${target}\nQuestion: ${userPrompt}`,
    system: sys,
    chainOfThought: true
  });
  const payloadBytes = (payload.length - 2) / 2;

  // Real agent deposit reserve + per-agent fee × committee
  let agentDeposit: bigint;
  try {
    const reserve = (await publicClient.readContract({
      address: PLATFORM_ADDRESS,
      abi: PLATFORM_ABI,
      functionName: "getRequestDeposit"
    })) as bigint;
    const pricePerAgent = parseEther(AGENTS[AGENT_SLUG.LLM_INFERENCE].pricePerAgent);
    agentDeposit = reserve + pricePerAgent * BigInt(SUBCOMMITTEE_SIZE);
  } catch (e) {
    return json({
      ok: false,
      error: `getRequestDeposit failed: ${(e as Error).message.slice(0, 200)}`,
      payloadBytes
    });
  }

  let account;
  try {
    account = getOrchestratorWallet().account;
  } catch (e) {
    return json({
      ok: false,
      error: `wallet init failed: ${(e as Error).message.slice(0, 200)}`,
      payloadBytes
    });
  }

  try {
    const sim = await publicClient.simulateContract({
      address: PLATFORM_ADDRESS,
      abi: PLATFORM_ABI,
      functionName: "createRequest",
      args: [
        getAgentId(AGENT_SLUG.LLM_INFERENCE),
        account.address,
        "0x00000000" as `0x${string}`,
        payload
      ],
      account,
      value: agentDeposit
    });
    return json({
      ok: true,
      requestIdSim: (sim.result as bigint | undefined)?.toString(),
      payloadBytes,
      agentDeposit: agentDeposit.toString(),
      intent
    });
  } catch (e) {
    const err = e as Error & { shortMessage?: string; metaMessages?: string[]; details?: string };
    const parts: string[] = [];
    parts.push(err.shortMessage || err.message);
    if (err.details && !parts.join(" ").includes(err.details)) parts.push(err.details);
    if (err.metaMessages?.length) parts.push(err.metaMessages.join(" | "));
    return json({
      ok: false,
      error: parts.join(" — ").slice(0, 800),
      payloadBytes,
      agentDeposit: agentDeposit.toString(),
      intent
    });
  }
}

function json(body: unknown) {
  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
