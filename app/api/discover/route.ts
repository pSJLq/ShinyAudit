/**
 * /api/discover?kind=…&q=…&days=… — the DISCOVERY layer.
 *
 * Everything is "find me things matching a criterion" rather than "look up
 * address X". This is what answers "top projects building this week", "newest
 * verified contracts", "biggest tokens", "search by name".
 *
 *   kind=fresh    — recently verified contracts, newest first (who's building)
 *   kind=trending — fresh contracts ranked by transaction_count (gaining traction)
 *   kind=tokens   — top tokens by holder count
 *   kind=search   — full-text search across addresses/tokens/contracts (needs q)
 *   kind=verified — most-recently verified, same as fresh (alias)
 *
 * Returns a compact `summary` (≤480 chars) the on-chain json-fetch agent reads
 * in one dispatch, plus a structured `items` array for the UI.
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
  } catch {
    return null;
  }
}

interface SCAddr {
  hash?: string;
  name?: string | null;
  is_scam?: boolean;
  proxy_type?: string | null;
}
interface SCItem {
  address?: SCAddr | string;
  address_hash?: string;
  coin_balance?: string;
  compiler_version?: string;
  language?: string;
  transactions_count?: number | null;
  verified_at?: string;
  certified?: boolean;
}
interface TokenItem {
  address?: string;
  address_hash?: string;
  name?: string;
  symbol?: string;
  holders_count?: string;
  total_supply?: string;
  type?: string;
}

function addrOf(x: SCItem | TokenItem): string {
  const a = (x as SCItem).address;
  if (typeof a === "string") return a;
  if (a && typeof a === "object" && a.hash) return a.hash;
  return (x as { address_hash?: string }).address_hash || "";
}

function daysAgo(iso?: string): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 86_400_000;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const kind = (url.searchParams.get("kind") || "fresh").toLowerCase();
  const q = url.searchParams.get("q") || "";
  const days = Number(url.searchParams.get("days") || "7");
  const t = Date.now();

  // ── search ──
  if (kind === "search") {
    if (!q) return json({ ok: false, error: "search needs ?q=", summary: "no query" });
    const res = await fetchJson<{ items?: Array<Record<string, unknown>> }>(`${V2}/search?q=${encodeURIComponent(q)}`);
    const items = (res?.items || []).slice(0, 10).map((it) => ({
      type: String(it.type ?? ""),
      address: String(it.address ?? it.address_hash ?? ""),
      name: String(it.name ?? it.symbol ?? ""),
      extra: it.symbol ? `$${it.symbol}` : it.url ? String(it.url) : ""
    }));
    const summary = items.length
      ? items.map((i) => `${i.name || i.address.slice(0, 10)} (${i.type})`).join("; ").slice(0, 480)
      : `no results for "${q}"`;
    return json({ ok: true, kind, q, elapsed_ms: Date.now() - t, summary, items });
  }

  // ── tokens (top by holders) ──
  if (kind === "tokens" || kind === "top-tokens") {
    const res = await fetchJson<{ items?: TokenItem[] }>(`${V2}/tokens`);
    const items = (res?.items || [])
      .map((it) => ({
        address: addrOf(it),
        name: it.name || "",
        symbol: it.symbol || "",
        holders: Number(it.holders_count || 0),
        type: it.type || ""
      }))
      .sort((a, b) => b.holders - a.holders)
      .slice(0, 12);
    const summary = items.length
      ? items.map((i) => `${i.name}/${i.symbol} (${i.holders.toLocaleString()} holders)`).join("; ").slice(0, 480)
      : "token index temporarily unavailable — retry or use kind=search";
    return json({ ok: true, kind: "tokens", elapsed_ms: Date.now() - t, summary, items });
  }

  // ── fresh / trending (recently verified contracts) ──
  const res = await fetchJson<{ items?: SCItem[] }>(`${V2}/smart-contracts?filter=solidity`);
  let list = (res?.items || []).map((it) => {
    const a = (typeof it.address === "object" ? it.address : null) as SCAddr | null;
    const balWei = it.coin_balance ? Number(it.coin_balance) : 0;
    return {
      address: addrOf(it),
      name: a?.name || null,                 // ← the real "what is this" signal
      compiler: it.compiler_version || "",
      language: it.language || "",
      balance_stt: balWei / 1e18,
      is_scam: !!a?.is_scam,
      verified_at: it.verified_at || "",
      age_days: daysAgo(it.verified_at),
      certified: !!it.certified
    };
  });

  // filter to the last N days when verified_at is present
  const withAge = list.filter((x) => x.age_days != null);
  if (withAge.length > 0) {
    list = list.filter((x) => x.age_days == null || (x.age_days as number) <= days);
  }

  if (kind === "trending") {
    // Somnia's verified-contracts feed doesn't expose tx counts, so "trending"
    // ranks by funded-and-named (a balance-holding contract with a known name
    // is a real, live project) then by recency.
    list.sort((a, b) =>
      (b.balance_stt - a.balance_stt) ||
      ((b.name ? 1 : 0) - (a.name ? 1 : 0)) ||
      ((Date.parse(b.verified_at || "0") || 0) - (Date.parse(a.verified_at || "0") || 0))
    );
  } else {
    // fresh: newest verification first
    list.sort((a, b) => (Date.parse(b.verified_at || "0") || 0) - (Date.parse(a.verified_at || "0") || 0));
  }
  const items = list.slice(0, 12);

  // Include BOTH the name (the "what's building" signal) AND the address, so
  // the agent can follow up on the exact contract. Dropping the address here
  // previously left the agent unable to act on discovered projects.
  // Format: "Name 0xABCD… (0.7d, 0.27 STT)".
  const summary = items
    .map((i) => {
      const age = i.age_days != null ? `${i.age_days.toFixed(1)}d` : "?";
      const nm = i.name ? `${i.name} ` : "";
      const bal = i.balance_stt > 0 ? `, ${i.balance_stt.toFixed(2)} STT` : "";
      return `${nm}${i.address.slice(0, 10)}… (${age}${bal})`;
    })
    .join("; ")
    .slice(0, 480);

  return json({
    ok: true,
    kind: kind === "trending" ? "trending" : "fresh",
    window_days: days,
    elapsed_ms: Date.now() - t,
    summary: summary || "no recently-verified contracts in window",
    items
  });
}

function json(body: unknown) {
  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "public, max-age=120" }
  });
}
