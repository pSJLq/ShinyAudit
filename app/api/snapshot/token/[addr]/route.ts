/**
 * /api/snapshot/token/[addr] — server-side aggregator for a token.
 * Returns compact `summary` so the on-chain json-fetch agent's validator
 * subcommittee converges fast on the small payload.
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

interface TokenV2 {
  name?: string;
  symbol?: string;
  decimals?: string;
  total_supply?: string;
  type?: string;
  holders?: string;
  exchange_rate?: string | null;
  circulating_market_cap?: string | null;
  address?: string;
}
interface HoldersV2 {
  items?: Array<{ address?: { hash?: string }; value?: string }>;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ addr: string }> }) {
  const { addr } = await ctx.params;
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
    return Response.json({ ok: false, error: "invalid address" }, { status: 400 });
  }
  const t = Date.now();
  const [tk, holders] = await Promise.all([
    fetchJson<TokenV2>(`${V2}/tokens/${addr}`),
    fetchJson<HoldersV2>(`${V2}/tokens/${addr}/holders`)
  ]);

  if (!tk?.name) {
    return Response.json({ ok: false, error: "not a token", summary: "not a token" }, { status: 200 });
  }

  const topHolders = (holders?.items || []).slice(0, 3);
  const parts: string[] = [];
  parts.push(`name=${tk.name}`);
  if (tk.symbol) parts.push(`symbol=${tk.symbol}`);
  if (tk.decimals) parts.push(`decimals=${tk.decimals}`);
  if (tk.total_supply) parts.push(`supply=${tk.total_supply}`);
  if (tk.type) parts.push(`type=${tk.type}`);
  if (tk.holders) parts.push(`holders=${tk.holders}`);
  if (topHolders.length > 0) {
    const top = topHolders[0];
    if (top.address?.hash) parts.push(`top_holder=${top.address.hash}`);
    if (top.value) parts.push(`top_value=${top.value}`);
  }
  if (tk.exchange_rate) parts.push(`rate=${tk.exchange_rate}`);
  const summary = parts.join(" | ");

  return Response.json(
    {
      ok: true,
      address: addr,
      elapsed_ms: Date.now() - t,
      summary,
      token: {
        name: tk.name,
        symbol: tk.symbol ?? null,
        decimals: tk.decimals ?? null,
        total_supply: tk.total_supply ?? null,
        type: tk.type ?? null,
        holders_count: tk.holders ?? null,
        exchange_rate: tk.exchange_rate ?? null
      },
      top_holders: topHolders.map((h) => ({
        address: h.address?.hash ?? null,
        value: h.value ?? null
      }))
    },
    { headers: { "cache-control": "public, max-age=60" } }
  );
}
