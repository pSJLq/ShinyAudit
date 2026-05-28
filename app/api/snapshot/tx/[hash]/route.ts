/**
 * /api/snapshot/tx/[hash] — server-side aggregator for a single tx.
 * Same pattern as /api/snapshot/[addr]: one URL the on-chain json-fetch
 * agent dispatches against, returns a compact <500-char `summary` so the
 * Somnia validator subcommittee converges fast.
 */

import { NextRequest } from "next/server";
import { EXPLORER_API } from "@/lib/somnia/chains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 60;

const V2 = EXPLORER_API.replace(/\/api$/, "/api/v2");

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

interface TxV2 {
  hash?: string;
  from?: { hash?: string };
  to?: { hash?: string };
  value?: string;
  method?: string;
  status?: string;
  timestamp?: string;
  block_number?: number;
  gas_used?: string;
  fee?: { value?: string };
  decoded_input?: { method_call?: string };
  raw_input?: string;
  revert_reason?: string | null;
  token_transfers?: Array<{ from?: { hash?: string }; to?: { hash?: string }; total?: { value?: string }; token?: { symbol?: string; address?: string } }>;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ hash: string }> }) {
  const { hash } = await ctx.params;
  if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
    return Response.json({ ok: false, error: "invalid 32-byte tx hash" }, { status: 400 });
  }
  const t = Date.now();
  const tx = await fetchJson<TxV2>(`${V2}/transactions/${hash}`);
  if (!tx) {
    return Response.json({ ok: false, error: "tx not found", summary: "tx not found" }, { status: 200 });
  }

  const valueWei = tx.value ? BigInt(tx.value) : 0n;
  const valueSTT = Number(valueWei) / 1e18;
  const transfers = tx.token_transfers || [];

  const parts: string[] = [];
  if (tx.from?.hash) parts.push(`from=${tx.from.hash}`);
  if (tx.to?.hash) parts.push(`to=${tx.to.hash}`);
  if (Number.isFinite(valueSTT)) parts.push(`value=${valueSTT.toFixed(6)}STT`);
  if (tx.method) parts.push(`method=${tx.method}`);
  else if (tx.raw_input && tx.raw_input.length > 10) parts.push(`method_id=${tx.raw_input.slice(0, 10)}`);
  if (tx.status) parts.push(`status=${tx.status}`);
  if (tx.timestamp) parts.push(`ts=${tx.timestamp}`);
  if (tx.block_number) parts.push(`block=${tx.block_number}`);
  if (tx.gas_used) parts.push(`gas=${tx.gas_used}`);
  if (tx.revert_reason) parts.push(`revert=${tx.revert_reason.slice(0, 60)}`);
  if (transfers.length > 0) {
    const first = transfers[0];
    parts.push(`tokens_transferred=${transfers.length}`);
    if (first.token?.symbol) parts.push(`first_token=${first.token.symbol}`);
  }
  const summary = parts.join(" | ");

  return Response.json(
    {
      ok: true,
      hash,
      elapsed_ms: Date.now() - t,
      summary,
      tx: {
        from: tx.from?.hash ?? null,
        to: tx.to?.hash ?? null,
        value_wei: valueWei.toString(),
        value_stt: Number.isFinite(valueSTT) ? Number(valueSTT.toFixed(6)) : null,
        method: tx.method ?? null,
        method_id: tx.raw_input?.slice(0, 10) ?? null,
        method_call: tx.decoded_input?.method_call ?? null,
        status: tx.status ?? null,
        timestamp: tx.timestamp ?? null,
        block: tx.block_number ?? null,
        gas_used: tx.gas_used ?? null,
        fee_wei: tx.fee?.value ?? null,
        revert_reason: tx.revert_reason ?? null,
        token_transfers: transfers.length
      }
    },
    { headers: { "cache-control": "public, max-age=60" } }
  );
}
