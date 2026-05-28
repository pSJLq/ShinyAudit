/**
 * /api/snapshot/[addr] — server-side composite snapshot of a target address.
 *
 * Same philosophy as /api/identity: a single deterministic URL the orchestrator
 * hits internally to get a full picture in ~1 second, no STT, no validator
 * consensus risk. Replaces the on-chain `*_snapshot` composite tools that
 * were doing 4 sequential on-chain dispatches (the `source` step alone could
 * take 30+ minutes because Solidity bytes are huge for consensus).
 *
 * Fetches (in parallel):
 *   • Blockscout v2 address — balance, total_txs, is_contract, public_name, ENS
 *   • Blockscout v2 smart-contract — name, compiler, language, is_proxy, source preview
 *   • Blockscout v2 counters — total_txs precise, tokens, validations
 *   • Blockscout v2 token — name, symbol, supply, decimals (if address is a token)
 *
 * Returns flattened normalized JSON the orchestrator pushes into history as a
 * single synthetic "tool snapshot_local(address=…) → name=X | ..." entry.
 */

import { NextRequest } from "next/server";
import { EXPLORER_API } from "@/lib/somnia/chains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 60;

const V2 = EXPLORER_API.replace(/\/api$/, "/api/v2");
const TIMEOUT_MS = 8000;
const UA = "shinyaudit/snapshot";

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, {
      headers: { accept: "application/json", "user-agent": UA },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

interface AddressV2 {
  hash?: string;
  coin_balance?: string;
  is_contract?: boolean;
  is_verified?: boolean;
  ens_domain_name?: string | null;
  public_tags?: Array<{ display_name?: string }>;
  name?: string | null;
  creator_address_hash?: string | null;
  creation_tx_hash?: string | null;
  implementation_address?: string | null;
  proxy_type?: string | null;
}
interface CountersV2 {
  transactions_count?: string;
  token_transfers_count?: string;
  gas_usage_count?: string;
  validations_count?: string;
}
interface SmartContractV2 {
  name?: string;
  language?: string;
  compiler_version?: string;
  optimization_enabled?: boolean;
  evm_version?: string;
  is_verified?: boolean;
  source_code?: string;
  abi?: unknown[];
  implementation_address?: string | null;
}
interface TokenV2 {
  name?: string;
  symbol?: string;
  decimals?: string;
  total_supply?: string;
  type?: string;
  holders?: string;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ addr: string }> }) {
  const { addr } = await ctx.params;
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
    return Response.json({ ok: false, error: "invalid address" }, { status: 400 });
  }

  const t = Date.now();
  const [address, counters, contract, token] = await Promise.all([
    fetchJson<AddressV2>(`${V2}/addresses/${addr}`),
    fetchJson<CountersV2>(`${V2}/addresses/${addr}/counters`),
    fetchJson<SmartContractV2>(`${V2}/smart-contracts/${addr}`),
    fetchJson<TokenV2>(`${V2}/tokens/${addr}`)
  ]);

  // Source preview — first 1500 chars only. Full source is what made the
  // on-chain composite take 30 minutes; for the planner's purposes, the
  // header (pragma + imports + first contract) is what matters.
  const sourceFull = contract?.source_code || "";
  const sourcePreview = sourceFull
    ? (sourceFull.length > 1500 ? sourceFull.slice(0, 1500) + " …[truncated]" : sourceFull)
    : null;

  // Convert balance wei → STT for human eyes
  const balanceWei = address?.coin_balance ? BigInt(address.coin_balance) : 0n;
  const balanceSTT = Number(balanceWei) / 1e18;

  // Compact joined summary — what an on-chain json-fetch tool retrieves in
  // ONE dispatch with selector="summary". <500 chars so validator consensus
  // converges fast. This is the agentic-speed sweet spot: smart server-side
  // data provider + small on-chain payload.
  const summaryParts: string[] = [];
  summaryParts.push(`is_contract=${address?.is_contract ?? false}`);
  if (Number.isFinite(balanceSTT)) summaryParts.push(`balance=${balanceSTT.toFixed(4)}STT`);
  if (counters?.transactions_count) summaryParts.push(`total_txs=${counters.transactions_count}`);
  if (address?.ens_domain_name) summaryParts.push(`ens=${address.ens_domain_name}`);
  if (address?.name || address?.public_tags?.[0]?.display_name) {
    summaryParts.push(`public_name=${address.name || address.public_tags?.[0]?.display_name}`);
  }
  if (address?.creator_address_hash) summaryParts.push(`creator=${address.creator_address_hash}`);
  if (address?.implementation_address || contract?.implementation_address) {
    summaryParts.push(`impl=${address?.implementation_address || contract?.implementation_address}`);
  }
  if (contract?.name) summaryParts.push(`name=${contract.name}`);
  if (contract?.compiler_version) summaryParts.push(`compiler=${contract.compiler_version}`);
  if (contract?.language) summaryParts.push(`lang=${contract.language}`);
  if (contract?.is_verified !== undefined) summaryParts.push(`verified=${contract.is_verified}`);
  if (sourceFull) summaryParts.push(`source_bytes=${sourceFull.length}`);
  if (token?.name) summaryParts.push(`token=${token.name}/${token.symbol || "?"}`);
  const summary = summaryParts.join(" | ");

  return Response.json(
    {
      ok: true,
      address: addr,
      elapsed_ms: Date.now() - t,
      summary,
      address_info: {
        is_contract: address?.is_contract ?? false,
        is_verified_contract: contract?.is_verified ?? false,
        ens: address?.ens_domain_name ?? null,
        public_name: address?.name ?? address?.public_tags?.[0]?.display_name ?? null,
        balance_wei: balanceWei.toString(),
        balance_stt: Number.isFinite(balanceSTT) ? Number(balanceSTT.toFixed(6)) : null,
        creator: address?.creator_address_hash ?? null,
        creation_tx: address?.creation_tx_hash ?? null,
        implementation: address?.implementation_address ?? contract?.implementation_address ?? null,
        proxy_type: address?.proxy_type ?? null
      },
      counters: {
        transactions: counters?.transactions_count ?? null,
        token_transfers: counters?.token_transfers_count ?? null,
        gas_used: counters?.gas_usage_count ?? null,
        validations: counters?.validations_count ?? null
      },
      contract: contract
        ? {
            name: contract.name ?? null,
            language: contract.language ?? null,
            compiler: contract.compiler_version ?? null,
            optimization: contract.optimization_enabled ?? null,
            evm_version: contract.evm_version ?? null,
            is_proxy: !!(address?.implementation_address ?? contract.implementation_address),
            has_abi: Array.isArray(contract.abi) && contract.abi.length > 0,
            source_size: sourceFull.length,
            source_preview: sourcePreview
          }
        : null,
      token: token?.name
        ? {
            name: token.name,
            symbol: token.symbol ?? null,
            decimals: token.decimals ?? null,
            total_supply: token.total_supply ?? null,
            type: token.type ?? null,
            holders: token.holders ?? null
          }
        : null
    },
    { headers: { "cache-control": "public, max-age=60" } }
  );
}
