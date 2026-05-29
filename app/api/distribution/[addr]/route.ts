/**
 * /api/distribution/[addr] — token decentralization / whale analysis.
 *
 * "How fairly is this token distributed?" Computes from the holder list:
 *   • top-1 / top-3 / top-10 concentration %
 *   • a Nakamoto-style count (how many holders to reach >50% supply)
 *   • labels the biggest holders (DEX pool / treasury / vesting / EOA)
 *
 * This is exactly how you answer "where are the team/community tokens" and
 * "is this a whale-controlled token".
 */
import { NextRequest } from "next/server";
import { EXPLORER_API } from "@/lib/somnia/chains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 120;

const V2 = EXPLORER_API.replace(/\/api$/, "/api/v2");

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(10000) });
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

  const [token, holders] = await Promise.all([
    fetchJson<{ name?: string; symbol?: string; total_supply?: string; holders_count?: string }>(`${V2}/tokens/${addr}`),
    fetchJson<{ items?: Array<{ address?: { hash?: string }; value?: string }> }>(`${V2}/tokens/${addr}/holders`)
  ]);

  const supply = Number(token?.total_supply || 0);
  const items = holders?.items || [];
  if (!supply || items.length === 0) {
    return Response.json(
      { ok: true, address: addr, summary: token?.name ? `${token.name}: holder data unavailable for distribution analysis` : "not a token / no holders", },
      { headers: { "cache-control": "public, max-age=120" } }
    );
  }

  const vals = items.map((h) => ({ a: h.address?.hash || "", v: Number(h.value || 0) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
  const pct = (v: number) => (v / supply) * 100;
  const sumTop = (n: number) => vals.slice(0, n).reduce((s, x) => s + x.v, 0);

  const top1 = pct(vals[0]?.v || 0);
  const top3 = pct(sumTop(3));
  const top10 = pct(sumTop(10));

  // Nakamoto: how many top holders to cross 50%.
  let cum = 0, nak = 0;
  for (const x of vals) { cum += x.v; nak++; if (cum / supply > 0.5) break; }

  // Label the biggest holders.
  const labelOf = async (a: string) => {
    const sc = await fetchJson<{ name?: string | null }>(`${V2}/smart-contracts/${a}`);
    return sc?.name || null;
  };
  const labels = await Promise.all(vals.slice(0, 3).map((x) => labelOf(x.a)));

  let verdict: string;
  if (top1 >= 90) verdict = "EXTREMELY centralized (one holder owns nearly all)";
  else if (top10 >= 90) verdict = "highly centralized (top-10 own >90%)";
  else if (top10 >= 60) verdict = "concentrated";
  else if (nak >= 20) verdict = "fairly distributed";
  else verdict = "moderately distributed";

  const topLabel = labels[0] ? ` (${labels[0]})` : "";
  const summary =
    `${token?.name || "token"}: top1=${top1.toFixed(1)}%${topLabel} · top3=${top3.toFixed(1)}% · top10=${top10.toFixed(1)}% · Nakamoto=${nak} · ${verdict}`;

  return Response.json(
    {
      ok: true,
      address: addr,
      elapsed_ms: Date.now() - t,
      summary: summary.slice(0, 480),
      total_supply: token?.total_supply,
      holders_count: token?.holders_count,
      top1_pct: Number(top1.toFixed(2)),
      top3_pct: Number(top3.toFixed(2)),
      top10_pct: Number(top10.toFixed(2)),
      nakamoto: nak,
      verdict,
      top_holders: vals.slice(0, 5).map((x, i) => ({ address: x.a, pct: Number(pct(x.v).toFixed(2)), label: labels[i] || null }))
    },
    { headers: { "cache-control": "public, max-age=120" } }
  );
}
