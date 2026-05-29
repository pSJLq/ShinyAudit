/**
 * /api/safety/[addr] — aggregated risk score (0–100) for any address.
 *
 * One number + reasons, combining signals an investigator would check:
 *   • Blockscout scam flag / reputation
 *   • contract verified?  (unverified = opaque = higher risk)
 *   • is_proxy / upgradeable (admin can change logic)
 *   • wallet age & tx volume (brand-new = riskier counterparty)
 *   • public name / ENS (labeled entities are lower risk)
 *
 * Returns "score=72/100 (HIGH) · reasons: unverified; upgradeable proxy; fresh".
 * Higher score = MORE risk.
 */
import { NextRequest } from "next/server";
import { EXPLORER_API } from "@/lib/somnia/chains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 60;

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

export async function GET(_req: NextRequest, ctx: { params: Promise<{ addr: string }> }) {
  const { addr } = await ctx.params;
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
    return Response.json({ ok: false, error: "invalid address", summary: "invalid address" }, { status: 200 });
  }
  const t = Date.now();

  const [info, counters, sc] = await Promise.all([
    fetchJson<{
      is_contract?: boolean;
      is_scam?: boolean;
      is_verified?: boolean;
      name?: string | null;
      ens_domain_name?: string | null;
      implementation_address?: string | null;
      public_tags?: Array<{ display_name?: string }>;
    }>(`${V2}/addresses/${addr}`),
    fetchJson<{ transactions_count?: string }>(`${V2}/addresses/${addr}/counters`),
    fetchJson<{ is_verified?: boolean; name?: string | null }>(`${V2}/smart-contracts/${addr}`)
  ]);

  let score = 0;
  const reasons: string[] = [];
  const good: string[] = [];

  const isContract = info?.is_contract ?? false;
  const verified = sc?.is_verified ?? info?.is_verified ?? false;
  const isProxy = !!info?.implementation_address;
  const txCount = Number(counters?.transactions_count || 0);
  const named = info?.name || info?.ens_domain_name || info?.public_tags?.[0]?.display_name;

  if (info?.is_scam) { score += 60; reasons.push("FLAGGED as scam by explorer"); }

  if (isContract) {
    if (!verified) { score += 25; reasons.push("unverified contract (opaque bytecode)"); }
    else good.push("source verified");
    if (isProxy) { score += 15; reasons.push("upgradeable proxy (admin can change logic)"); }
  }

  if (txCount < 10) { score += 15; reasons.push(`very low activity (${txCount} txs — fresh/untested)`); }
  else if (txCount > 1000) good.push(`established (${txCount.toLocaleString()} txs)`);

  if (named) { score = Math.max(0, score - 10); good.push(`labeled "${named}"`); }
  else if (isContract) { score += 5; reasons.push("no public name/label"); }

  score = Math.min(100, Math.max(0, score));
  const band = score >= 60 ? "HIGH" : score >= 30 ? "MEDIUM" : score >= 10 ? "LOW" : "MINIMAL";

  const summary =
    `score=${score}/100 (${band} risk)` +
    (reasons.length ? ` · risks: ${reasons.join("; ")}` : "") +
    (good.length ? ` · ok: ${good.join("; ")}` : "");

  return Response.json(
    { ok: true, address: addr, elapsed_ms: Date.now() - t, score, band, summary, reasons, positives: good },
    { headers: { "cache-control": "public, max-age=60" } }
  );
}
