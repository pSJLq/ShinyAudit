/**
 * /api/wealth/[addr] — full portfolio valuation of a wallet.
 *
 * "How rich is this wallet / what does it hold?" Sums:
 *   • native STT balance
 *   • every ERC-20 token balance it holds (with symbol)
 *   • NFT collection count
 * Ranks holdings and gives a one-line net-worth-ish summary (in token units;
 * USD needs a price oracle which testnet lacks).
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
  } catch { return null; }
}

interface TB { token?: { name?: string; symbol?: string; decimals?: string; type?: string; exchange_rate?: string | null }; value?: string }

export async function GET(_req: NextRequest, ctx: { params: Promise<{ addr: string }> }) {
  const { addr } = await ctx.params;
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
    return Response.json({ ok: false, error: "invalid address", summary: "invalid address" }, { status: 200 });
  }
  const t = Date.now();

  const [info, tokens] = await Promise.all([
    fetchJson<{ coin_balance?: string }>(`${V2}/addresses/${addr}`),
    fetchJson<{ items?: TB[] }>(`${V2}/addresses/${addr}/token-balances`)
  ]);

  const native = info?.coin_balance ? Number(BigInt(info.coin_balance)) / 1e18 : 0;
  const items = tokens?.items || [];

  const erc20: Array<{ symbol: string; amount: number; usd: number | null }> = [];
  let nftCount = 0;
  let usdTotal = native > 0 ? 0 : 0; // native USD unknown on testnet

  for (const it of items) {
    const type = (it.token?.type || "").toUpperCase();
    if (type.includes("721") || type.includes("1155")) { nftCount++; continue; }
    const dec = Number(it.token?.decimals || 18);
    const amt = it.value ? Number(BigInt(it.value)) / 10 ** dec : 0;
    const rate = it.token?.exchange_rate ? Number(it.token.exchange_rate) : null;
    const usd = rate != null ? amt * rate : null;
    if (usd != null) usdTotal += usd;
    erc20.push({ symbol: it.token?.symbol || "?", amount: amt, usd });
  }
  erc20.sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0) || b.amount - a.amount);

  const topHoldings = erc20.slice(0, 5).map((e) => `${e.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${e.symbol}`);
  const parts: string[] = [`native=${native.toFixed(4)} STT`, `${erc20.length} ERC-20${nftCount ? `, ${nftCount} NFT collections` : ""}`];
  if (topHoldings.length) parts.push(`top: ${topHoldings.join(", ")}`);
  if (usdTotal > 0) parts.push(`≈ $${usdTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} (priced tokens only)`);
  const summary = parts.join(" | ");

  return Response.json(
    {
      ok: true, address: addr, elapsed_ms: Date.now() - t,
      summary: summary.slice(0, 480),
      native_stt: Number(native.toFixed(6)),
      token_count: erc20.length, nft_collections: nftCount,
      usd_estimate: usdTotal > 0 ? Number(usdTotal.toFixed(2)) : null,
      top_holdings: erc20.slice(0, 10)
    },
    { headers: { "cache-control": "public, max-age=60" } }
  );
}
