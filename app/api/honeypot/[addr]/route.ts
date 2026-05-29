/**
 * /api/honeypot/[addr] — "can you actually SELL this token?" detector.
 *
 * The classic rug pattern: you can BUY but transfer/sell reverts or is taxed
 * to zero. Without a forking simulator we use strong on-chain heuristics that
 * catch the vast majority of honeypots:
 *   • recover the token's function surface (selectors) — look for blacklist /
 *     setMaxTx / setFee / pause / onlyOwner-gated transfer hooks
 *   • read tax-like getters via view_call patterns (buyTax/sellTax/_tax/fee)
 *   • check transfer ownership concentration (single holder ~100% = trap)
 *   • verified? unverified tax-tokens are far likelier to be traps
 *
 * Returns "risk=HIGH · sellable=doubtful · reasons: unverified; setFee()+blacklist(); 98% one holder".
 */
import { NextRequest } from "next/server";
import { createPublicClient, http, toFunctionSelector, type Hex } from "viem";
import { EXPLORER_API } from "@/lib/somnia/chains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 120;

const client = createPublicClient({ transport: http("https://api.infra.testnet.somnia.network/") });
const V2 = EXPLORER_API.replace(/\/api$/, "/api/v2");
const BASE = (process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(9000) });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch { return null; }
}
async function readUint(to: string, sig: string): Promise<bigint | null> {
  try {
    const res = await client.call({ to: to as Hex, data: toFunctionSelector(sig) });
    if (!res.data || res.data === "0x") return null;
    return BigInt(res.data);
  } catch { return null; }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ addr: string }> }) {
  const { addr } = await ctx.params;
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
    return Response.json({ ok: false, error: "invalid address", summary: "invalid address" }, { status: 200 });
  }
  const t = Date.now();

  const [sel, token, sc, holders] = await Promise.all([
    fetchJson<{ named?: Array<{ signature: string }>; flags?: string[] }>(`${BASE}/api/selectors/${addr}`),
    fetchJson<{ name?: string; symbol?: string; total_supply?: string; holders_count?: string; type?: string }>(`${V2}/tokens/${addr}`),
    fetchJson<{ is_verified?: boolean }>(`${V2}/smart-contracts/${addr}`),
    fetchJson<{ items?: Array<{ value?: string }> }>(`${V2}/tokens/${addr}/holders`)
  ]);

  if (!token?.type) {
    return Response.json(
      { ok: true, address: addr, summary: "not a recognized token — honeypot check N/A", is_token: false },
      { headers: { "cache-control": "public, max-age=120" } }
    );
  }

  const sigs = (sel?.named || []).map((s) => s.signature.toLowerCase());
  const reasons: string[] = [];
  let risk = 0;

  const verified = sc?.is_verified ?? false;
  if (!verified) { risk += 25; reasons.push("unverified token contract"); }

  const hasAny = (re: RegExp) => sigs.some((s) => re.test(s));
  if (hasAny(/blacklist|blocklist|_bots|isbot/)) { risk += 30; reasons.push("blacklist/bot-block function present"); }
  if (hasAny(/setfee|settax|setmaxtx|setmaxwallet|setlimit/)) { risk += 20; reasons.push("owner can change fees/limits"); }
  if (hasAny(/pause|enabletrading|opentrading|tradingactive/)) { risk += 15; reasons.push("trading can be paused/gated"); }
  if (hasAny(/excludefrom|setexcluded/)) { risk += 10; reasons.push("per-address exclusion logic (selective tax)"); }

  // tax getters
  const buyTax = (await readUint(addr, "buyTax()")) ?? (await readUint(addr, "_buyTax()")) ?? (await readUint(addr, "buyFee()"));
  const sellTax = (await readUint(addr, "sellTax()")) ?? (await readUint(addr, "_sellTax()")) ?? (await readUint(addr, "sellFee()"));
  if (sellTax != null && sellTax >= 50n) { risk += 30; reasons.push(`sell tax ${sellTax}% (extreme)`); }
  else if (sellTax != null && sellTax > 10n) { risk += 12; reasons.push(`sell tax ${sellTax}%`); }

  // holder concentration
  const supply = Number(token.total_supply || 0);
  const top = Number(holders?.items?.[0]?.value || 0);
  const conc = supply > 0 && top > 0 ? (top / supply) * 100 : 0;
  if (conc >= 90) { risk += 25; reasons.push(`${conc.toFixed(0)}% supply in ONE holder (exit-liquidity trap)`); }
  else if (conc >= 50) { risk += 10; reasons.push(`${conc.toFixed(0)}% in top holder`); }

  risk = Math.min(100, risk);
  const band = risk >= 60 ? "HIGH" : risk >= 30 ? "MEDIUM" : risk >= 12 ? "LOW" : "MINIMAL";
  const sellable = risk >= 60 ? "doubtful — likely honeypot/rug" : risk >= 30 ? "caution — owner can restrict" : "no obvious sell-block found";

  const summary =
    `honeypot-risk=${risk}/100 (${band}) · sellable: ${sellable}` +
    (reasons.length ? ` · ${reasons.join("; ")}` : "");

  return Response.json(
    { ok: true, address: addr, elapsed_ms: Date.now() - t, is_token: true, risk, band, sellable, summary: summary.slice(0, 480), reasons, buy_tax: buyTax?.toString() ?? null, sell_tax: sellTax?.toString() ?? null },
    { headers: { "cache-control": "public, max-age=120" } }
  );
}
