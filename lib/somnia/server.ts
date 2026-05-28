/**
 * Server-only clients. NEVER import from a "use client" component.
 *
 * The orchestrator wallet signs `createRequest()` transactions on behalf of
 * the user (we pay the agent deposit, the user covers our service fee in
 * a separate billing flow). This pattern keeps the dApp UX one-click and
 * insulates us from per-user wallet quirks.
 */

import "server-only";
import { createPublicClient, createWalletClient, http, type Hex, type PublicClient, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ACTIVE_CHAIN, ACTIVE_NETWORK } from "./chains";

export const publicClient: PublicClient = createPublicClient({
  chain: ACTIVE_CHAIN,
  transport: http(ACTIVE_NETWORK.rpcUrl)
});

let cachedWallet: WalletClient | null = null;
let cachedAccount: ReturnType<typeof privateKeyToAccount> | null = null;

export function getOrchestratorWallet(): { wallet: WalletClient; account: NonNullable<typeof cachedAccount> } {
  if (cachedWallet && cachedAccount) return { wallet: cachedWallet, account: cachedAccount };

  const raw = process.env.PRIVATE_KEY;
  if (!raw) throw new Error("PRIVATE_KEY env var required");
  const stripped = raw.startsWith("0x") ? raw.slice(2) : raw;
  if (stripped.length !== 64 || !/^[0-9a-fA-F]+$/.test(stripped)) {
    throw new Error("PRIVATE_KEY must be 32 bytes hex (64 hex chars, optionally prefixed with 0x)");
  }
  const pk = (`0x${stripped}`) as Hex;

  const account = privateKeyToAccount(pk);
  const wallet = createWalletClient({
    account,
    chain: ACTIVE_CHAIN,
    transport: http(ACTIVE_NETWORK.rpcUrl)
  });
  cachedAccount = account;
  cachedWallet = wallet;
  return { wallet, account };
}
