/**
 * /api/nft/[addr] — NFT collection analyzer.
 *
 * For an ERC721/1155 collection: name, symbol, total supply/minted, holder
 * count, top holders (concentration), and royalty (EIP-2981) if present.
 * Answers "is this NFT collection legit / concentrated / who holds it".
 *
 * Returns "BoredApes (BAYC) · 10000 items · 6400 holders · top holder 2.1%".
 */
import { NextRequest } from "next/server";
import { EXPLORER_API } from "@/lib/somnia/chains";
import { createPublicClient, http, toFunctionSelector, type Hex } from "viem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 120;

const V2 = EXPLORER_API.replace(/\/api$/, "/api/v2");
const client = createPublicClient({ transport: http("https://api.infra.testnet.somnia.network/") });

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(9000) });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ addr: string }> }) {
  const { addr } = await ctx.params;
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
    return Response.json({ ok: false, error: "invalid address", summary: "invalid address" }, { status: 200 });
  }
  const t = Date.now();

  const [token, holders] = await Promise.all([
    fetchJson<{ name?: string; symbol?: string; total_supply?: string; holders_count?: string; type?: string }>(`${V2}/tokens/${addr}`),
    fetchJson<{ items?: Array<{ address?: { hash?: string }; value?: string }> }>(`${V2}/tokens/${addr}/holders`)
  ]);

  if (!token?.name && !token?.type) {
    return Response.json(
      { ok: true, address: addr, summary: "not an indexed NFT/token collection (no token metadata)", is_nft: false },
      { headers: { "cache-control": "public, max-age=120" } }
    );
  }

  // If it's a fungible token (ERC-20), this isn't an NFT collection — say so
  // rather than mislabeling supply as "items".
  const ttype = (token.type || "").toUpperCase();
  if (ttype.includes("ERC-20") || ttype === "ERC20") {
    return Response.json(
      {
        ok: true,
        address: addr,
        is_nft: false,
        summary: `${token.name}${token.symbol ? ` (${token.symbol})` : ""} is a fungible ERC-20 token, not an NFT collection — use token_snapshot instead.`
      },
      { headers: { "cache-control": "public, max-age=120" } }
    );
  }

  const supply = Number(token?.total_supply || 0);
  const holderCount = Number(token?.holders_count || 0);
  const top = holders?.items || [];
  const topHolder = top[0];
  const topVal = Number(topHolder?.value || 0);
  const concentration = supply > 0 && topVal > 0 ? ((topVal / supply) * 100).toFixed(1) : null;

  // royalty via EIP-2981 royaltyInfo(0,10000) — best-effort
  let royaltyPct: string | null = null;
  try {
    const sel = toFunctionSelector("royaltyInfo(uint256,uint256)");
    const args = "0".padStart(64, "0") + (10000).toString(16).padStart(64, "0");
    const res = await client.call({ to: addr as Hex, data: (sel + args) as Hex });
    if (res.data && res.data.length >= 130) {
      const amount = BigInt("0x" + res.data.slice(2).slice(64, 128));
      royaltyPct = ((Number(amount) / 10000) * 100).toFixed(1);
    }
  } catch { /* no royalty */ }

  const parts: string[] = [`${token?.name || "?"}${token?.symbol ? ` (${token.symbol})` : ""}`];
  if (token?.type) parts.push(token.type);
  if (supply) parts.push(`${supply.toLocaleString()} items`);
  if (holderCount) parts.push(`${holderCount.toLocaleString()} holders`);
  if (concentration) parts.push(`top holder ${concentration}%`);
  if (royaltyPct) parts.push(`royalty ${royaltyPct}%`);
  const summary = parts.join(" · ");

  return Response.json(
    {
      ok: true,
      address: addr,
      elapsed_ms: Date.now() - t,
      is_nft: true,
      summary,
      name: token?.name, symbol: token?.symbol, type: token?.type,
      supply, holders: holderCount,
      top_holder: topHolder?.address?.hash || null,
      top_holder_pct: concentration,
      royalty_pct: royaltyPct
    },
    { headers: { "cache-control": "public, max-age=120" } }
  );
}
