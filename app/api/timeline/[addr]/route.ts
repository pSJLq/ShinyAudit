/**
 * /api/timeline/[addr] — chronological activity profile of a wallet/contract.
 *
 * "When did this wake up, when was it last active, what's its rhythm?" Builds:
 *   • first-seen (oldest tx) + age in days
 *   • last-active (newest tx) + dormancy
 *   • total tx volume → cadence (busy vs dormant vs one-shot)
 *   • the very first counterparty (genesis interaction)
 *
 * Returns "first seen 142d ago · last active 2d ago · 9262 txs · genesis from 0xFUND".
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
  } catch {
    return null;
  }
}

function ago(ts: number): string {
  const days = (Date.now() / 1000 - ts) / 86400;
  if (days < 1) return `${(days * 24).toFixed(0)}h`;
  if (days < 60) return `${days.toFixed(1)}d`;
  return `${(days / 30).toFixed(1)}mo`;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ addr: string }> }) {
  const { addr } = await ctx.params;
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
    return Response.json({ ok: false, error: "invalid address", summary: "invalid address" }, { status: 200 });
  }
  const t = Date.now();

  const [firstTx, lastTx, counters] = await Promise.all([
    fetchJson<{ result?: Array<{ timeStamp?: string; from?: string; hash?: string }> }>(
      `${V1}?module=account&action=txlist&address=${addr}&page=1&offset=1&sort=asc`
    ),
    fetchJson<{ result?: Array<{ timeStamp?: string }> }>(
      `${V1}?module=account&action=txlist&address=${addr}&page=1&offset=1&sort=desc`
    ),
    fetchJson<{ transactions_count?: string }>(`${V2}/addresses/${addr}/counters`)
  ]);

  const first = firstTx?.result?.[0];
  const last = lastTx?.result?.[0];
  if (!first?.timeStamp) {
    return Response.json(
      { ok: true, address: addr, summary: "no transaction history (never active or not indexed)" },
      { headers: { "cache-control": "public, max-age=60" } }
    );
  }

  const firstTs = Number(first.timeStamp);
  const lastTs = Number(last?.timeStamp || first.timeStamp);
  const txCount = Number(counters?.transactions_count || 0);
  const ageDays = (Date.now() / 1000 - firstTs) / 86400;
  const dormantDays = (Date.now() / 1000 - lastTs) / 86400;

  let cadence: string;
  if (txCount <= 1) cadence = "one-shot (single tx)";
  else if (dormantDays > 30) cadence = "dormant";
  else if (txCount / Math.max(1, ageDays) > 5) cadence = "very active";
  else cadence = "occasionally active";

  const genesis = first.from ? `genesis from ${first.from.slice(0, 10)}…` : "";
  const summary =
    `first seen ${ago(firstTs)} ago · last active ${ago(lastTs)} ago · ${txCount.toLocaleString()} txs · ${cadence}` +
    (genesis ? ` · ${genesis}` : "");

  return Response.json(
    {
      ok: true,
      address: addr,
      elapsed_ms: Date.now() - t,
      summary,
      first_seen_ts: firstTs,
      last_active_ts: lastTs,
      age_days: Number(ageDays.toFixed(1)),
      dormant_days: Number(dormantDays.toFixed(1)),
      tx_count: txCount,
      cadence,
      genesis_counterparty: first.from || null,
      genesis_tx: first.hash || null
    },
    { headers: { "cache-control": "public, max-age=60" } }
  );
}
