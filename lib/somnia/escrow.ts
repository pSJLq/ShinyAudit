/**
 * ShinyAuditEscrow — typed surface for our billing contract.
 *
 * Deployment artifact is checked in at lib/somnia/escrow-deployment.json
 * (produced by scripts/compile-and-deploy-escrow.mjs).
 */

import deployment from "./escrow-deployment.json";
import type { Abi } from "viem";

export const ESCROW_ADDRESS = (process.env.NEXT_PUBLIC_ESCROW_ADDRESS ?? deployment.address) as `0x${string}`;
export const ESCROW_ABI = deployment.abi as Abi;
export const ESCROW_DEPLOY_TX = deployment.txHash as `0x${string}`;
export const ESCROW_OWNER = deployment.owner as `0x${string}`;
export const ESCROW_ORCHESTRATOR = deployment.orchestrator as `0x${string}`;

/** Constant copy of contract values for client-side maths. */
export const SERVICE_FEE_BPS = 5_000n;
export const BPS_DENOM = 10_000n;

/** Mirrors `ShinyAuditEscrow.quote()`. */
export function quoteEscrow(agentDeposit: bigint): { total: bigint; fee: bigint } {
  const fee = (agentDeposit * SERVICE_FEE_BPS) / BPS_DENOM;
  return { fee, total: agentDeposit + fee };
}
