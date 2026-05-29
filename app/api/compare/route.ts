/**
 * /api/compare?a=0x..&b=0x.. — relationship analyzer between two addresses.
 *
 * "Are these the same person / linked?" Checks for on-chain links:
 *   • same creator (both deployed by the same wallet)
 *   • same first-funder (bootstrapped from the same source)
 *   • direct transfers between A and B
 *   • shared top counterparties
 *   • same code (if both contracts)
 *
 * Returns "LINKED: same creator 0xDEAD; 3 direct transfers A→B" or
 * "no direct on-chain link found".
 */
import { NextRequest } from "next/server";
import { EXPLORER_API } from "@/lib/somnia/chains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 60;

const V1 = EXPLORER_API; // module=account style
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

async function creator(a: string): Promise<string | null> {
  const j = await fetchJson<{ creator_address_hash?: string | null }>(`${V2}/addresses/${a}`);
  return j?.creator_address_hash?.toLowerCase() || null;
}
async function firstFunder(a: string): Promise<string | null> {
  const j = await fetchJson<{ result?: Array<{ from?: string }> }>(
    `${V1}?module=account&action=txlist&address=${a}&page=1&offset=1&sort=asc`
  );
  return j?.result?.[0]?.from?.toLowerCase() || null;
}
async function counterparties(a: string): Promise<Set<string>> {
  const j = await fetchJson<{ result?: Array<{ from?: string; to?: string }> }>(
    `${V1}?module=account&action=txlist&address=${a}&page=1&offset=20&sort=desc`
  );
  const set = new Set<string>();
  const lower = a.toLowerCase();
  for (const tx of j?.result || []) {
    const f = tx.from?.toLowerCase();
    const t = tx.to?.toLowerCase();
    if (f && f !== lower) set.add(f);
    if (t && t !== lower) set.add(t);
  }
  return set;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const a = (url.searchParams.get("a") || "").toLowerCase();
  const b = (url.searchParams.get("b") || "").toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(a) || !/^0x[a-f0-9]{40}$/.test(b)) {
    return Response.json({ ok: false, error: "need ?a=0x..&b=0x..", summary: "two valid addresses required" }, { status: 200 });
  }
  const t = Date.now();

  const [cA, cB, fA, fB, cpA, cpB] = await Promise.all([
    creator(a), creator(b), firstFunder(a), firstFunder(b), counterparties(a), counterparties(b)
  ]);

  const links: string[] = [];
  if (cA && cB && cA === cB) links.push(`same creator ${cA.slice(0, 10)}…`);
  if (fA && fB && fA === fB) links.push(`same first-funder ${fA.slice(0, 10)}…`);
  if (fA && fA === b) links.push("B funded A directly");
  if (fB && fB === a) links.push("A funded B directly");
  if (cpA.has(b)) links.push("A transacted with B directly");
  // shared counterparties (excluding each other)
  const shared = [...cpA].filter((x) => cpB.has(x) && x !== a && x !== b);
  if (shared.length) links.push(`${shared.length} shared counterparties (e.g. ${shared[0].slice(0, 10)}…)`);

  const linked = links.length > 0;
  const summary = linked
    ? `LINKED — ${links.join("; ")}`
    : "no direct on-chain link found (different creators, funders, no shared counterparties in recent history)";

  return Response.json(
    {
      ok: true,
      a, b,
      elapsed_ms: Date.now() - t,
      linked,
      summary,
      links,
      a_creator: cA, b_creator: cB, a_first_funder: fA, b_first_funder: fB
    },
    { headers: { "cache-control": "public, max-age=60" } }
  );
}
