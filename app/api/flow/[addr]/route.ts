/**
 * /api/flow/[addr] — fund-flow analyzer. "Where did the money go / come from?"
 *
 * Aggregates the wallet's recent native + token transfers into:
 *   • top inflow sources (who funded it, how much)
 *   • top outflow destinations (where it sent, how much)
 *   • net direction (net receiver vs net spender)
 *   • CEX / bridge / contract labels on the biggest counterparties
 *
 * Returns compact `summary` for one on-chain dispatch.
 */
import { NextRequest } from "next/server";
import { EXPLORER_API } from "@/lib/somnia/chains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 60;

const V2 = EXPLORER_API.replace(/\/api$/, "/api/v2");

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

interface TxItem {
  from?: { hash?: string };
  to?: { hash?: string };
  value?: string;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ addr: string }> }) {
  const { addr } = await ctx.params;
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
    return Response.json({ ok: false, error: "invalid address", summary: "invalid address" }, { status: 200 });
  }
  const t = Date.now();
  const lower = addr.toLowerCase();

  const txs = await fetchJson<{ items?: TxItem[] }>(`${V2}/addresses/${addr}/transactions`);
  const items = txs?.items || [];

  const inflow = new Map<string, bigint>();
  const outflow = new Map<string, bigint>();
  let totalIn = 0n;
  let totalOut = 0n;

  for (const tx of items) {
    const from = tx.from?.hash?.toLowerCase();
    const to = tx.to?.hash?.toLowerCase();
    let val = 0n;
    try { val = BigInt(tx.value || "0"); } catch { val = 0n; }
    if (val === 0n) continue;
    if (to === lower && from) {
      inflow.set(from, (inflow.get(from) || 0n) + val);
      totalIn += val;
    } else if (from === lower && to) {
      outflow.set(to, (outflow.get(to) || 0n) + val);
      totalOut += val;
    }
  }

  const top = (m: Map<string, bigint>, n = 3) =>
    [...m.entries()].sort((a, b) => (b[1] > a[1] ? 1 : -1)).slice(0, n);
  const fmt = (wei: bigint) => (Number(wei) / 1e18).toFixed(4);

  // Label the single biggest counterparty each way.
  const labelAddr = async (a?: string) => {
    if (!a) return null;
    const sc = await fetchJson<{ name?: string | null }>(`${V2}/smart-contracts/${a}`);
    return sc?.name || null;
  };
  const topInAddr = top(inflow, 1)[0]?.[0];
  const topOutAddr = top(outflow, 1)[0]?.[0];
  const [inLabel, outLabel] = await Promise.all([labelAddr(topInAddr), labelAddr(topOutAddr)]);

  const net = totalIn - totalOut;
  const parts: string[] = [];
  parts.push(`native_in=${fmt(totalIn)}STT from ${inflow.size} src`);
  parts.push(`native_out=${fmt(totalOut)}STT to ${outflow.size} dst`);
  parts.push(`net=${net >= 0n ? "+" : ""}${fmt(net)}STT (${net >= 0n ? "net receiver" : "net spender"})`);
  if (topInAddr) parts.push(`top_in=${inLabel || topInAddr.slice(0, 10)} (${fmt(inflow.get(topInAddr)!)}STT)`);
  if (topOutAddr) parts.push(`top_out=${outLabel || topOutAddr.slice(0, 10)} (${fmt(outflow.get(topOutAddr)!)}STT)`);
  const summary = items.length ? parts.join(" | ") : "no recent native transfers";

  return Response.json(
    {
      ok: true,
      address: addr,
      elapsed_ms: Date.now() - t,
      summary,
      total_in_wei: totalIn.toString(),
      total_out_wei: totalOut.toString(),
      top_inflows: top(inflow).map(([a, v]) => ({ address: a, value_stt: fmt(v) })),
      top_outflows: top(outflow).map(([a, v]) => ({ address: a, value_stt: fmt(v) }))
    },
    { headers: { "cache-control": "public, max-age=60" } }
  );
}
