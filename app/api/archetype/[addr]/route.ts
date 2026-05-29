/**
 * /api/archetype/[addr] — behavioural classification of an address.
 *
 * "What KIND of actor is this?" Infers a role from on-chain behaviour:
 *   • contract vs EOA
 *   • deployer (created many contracts)
 *   • high-frequency trader / bot (huge tx count, tight cadence)
 *   • whale (large balance)
 *   • fresh / burner (few txs, recent)
 *   • dormant (old, inactive)
 *   • hub (interacts with very many distinct counterparties — CEX/router-like)
 *
 * Returns "EOA · high-frequency (9.2k txs, very active) · hub (340 counterparties)".
 */
import { NextRequest } from "next/server";
import { EXPLORER_API } from "@/lib/somnia/chains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 60;

const V1 = EXPLORER_API;
const V2 = EXPLORER_API.replace(/\/api$/, "/api/v2");

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(9000) });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch { return null; }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ addr: string }> }) {
  const { addr } = await ctx.params;
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
    return Response.json({ ok: false, error: "invalid address", summary: "invalid address" }, { status: 200 });
  }
  const t = Date.now();

  const [info, counters, recent, internals] = await Promise.all([
    fetchJson<{ is_contract?: boolean; coin_balance?: string; name?: string | null }>(`${V2}/addresses/${addr}`),
    fetchJson<{ transactions_count?: string }>(`${V2}/addresses/${addr}/counters`),
    fetchJson<{ result?: Array<{ from?: string; to?: string; timeStamp?: string }> }>(`${V1}?module=account&action=txlist&address=${addr}&page=1&offset=50&sort=desc`),
    fetchJson<{ result?: Array<{ contractAddress?: string }> }>(`${V1}?module=account&action=txlistinternal&address=${addr}&page=1&offset=50&sort=desc`)
  ]);

  const isContract = info?.is_contract ?? false;
  const txCount = Number(counters?.transactions_count || 0);
  const balance = info?.coin_balance ? Number(BigInt(info.coin_balance)) / 1e18 : 0;
  const txs = recent?.result || [];
  const lower = addr.toLowerCase();

  // distinct counterparties
  const cps = new Set<string>();
  for (const x of txs) { const f = x.from?.toLowerCase(); const o = x.to?.toLowerCase(); if (f && f !== lower) cps.add(f); if (o && o !== lower) cps.add(o); }

  // deploys (internal create txs with a contractAddress)
  const deploys = (internals?.result || []).filter((x) => x.contractAddress && x.contractAddress !== "").length;

  // cadence over the recent window
  let cadence = "low";
  if (txs.length >= 2) {
    const span = Number(txs[0].timeStamp || 0) - Number(txs[txs.length - 1].timeStamp || 0);
    const perDay = span > 0 ? (txs.length / (span / 86400)) : txs.length;
    cadence = perDay > 50 ? "very high" : perDay > 5 ? "high" : perDay > 0.5 ? "moderate" : "low";
  }

  const tags: string[] = [];
  tags.push(isContract ? "contract" : "EOA");
  if (deploys >= 3) tags.push(`deployer (${deploys}+ contracts)`);
  if (txCount > 5000) tags.push(`high-frequency (${txCount.toLocaleString()} txs)`);
  else if (txCount < 10) tags.push(`fresh/burner (${txCount} txs)`);
  if (balance > 1000) tags.push(`whale (${balance.toLocaleString(undefined, { maximumFractionDigits: 0 })} STT)`);
  if (cps.size > 40) tags.push(`hub (${cps.size}+ counterparties — router/CEX-like)`);
  if (cadence === "very high" && !isContract) tags.push("bot-like cadence");
  if (txs.length && (Date.now() / 1000 - Number(txs[0].timeStamp || 0)) > 60 * 86400) tags.push("dormant (60d+ idle)");
  if (info?.name) tags.push(`labeled "${info.name}"`);

  const summary = tags.join(" · ");

  return Response.json(
    { ok: true, address: addr, elapsed_ms: Date.now() - t, summary: summary.slice(0, 480), is_contract: isContract, tx_count: txCount, balance_stt: Number(balance.toFixed(4)), distinct_counterparties: cps.size, deploys, cadence, tags },
    { headers: { "cache-control": "public, max-age=60" } }
  );
}
