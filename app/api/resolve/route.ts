/**
 * /api/resolve?q=name-or-address — bidirectional name ↔ address resolver.
 *
 * Lets users type a NAME instead of a 0x address: "audit the Casino contract",
 * "who is vitalik.eth", "find SomniaExchange". We:
 *   • if q is already 0x40 → reverse-resolve to its identity/label
 *   • else → ENS resolve (vitalik.eth → 0x…), then Blockscout search by name
 *     (contracts/tokens), returning the best-matching address.
 *
 * Returns "vitalik.eth → 0xd8dA…6045" or "SomniaExchange → 0xABC… (token)".
 */
import { NextRequest } from "next/server";
import { EXPLORER_API } from "@/lib/somnia/chains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 120;

const V2 = EXPLORER_API.replace(/\/api$/, "/api/v2");
const BASE = (process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const r = await fetch(url, { ...init, headers: { accept: "application/json", ...(init?.headers || {}) }, cache: "no-store", signal: AbortSignal.timeout(9000) });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) return Response.json({ ok: false, error: "need ?q=", summary: "no query" }, { status: 200 });
  const t = Date.now();

  // 1) Already an address → reverse-resolve identity.
  if (/^0x[a-fA-F0-9]{40}$/.test(q)) {
    const id = await fetchJson<{ summary?: string; best?: string | null }>(`${BASE}/api/identity/${q}`);
    const label = id?.best || (id?.summary && !id.summary.startsWith("none") ? id.summary : null);
    return Response.json(
      { ok: true, input: q, kind: "address", resolved: label, summary: label ? `${q} → ${label}` : `${q} → no public name/handle found` },
      { headers: { "cache-control": "public, max-age=120" } }
    );
  }

  // 2) ENS name → address (mainnet registry via ensideas).
  if (/\.(eth|xyz|com|id|sol)$/i.test(q)) {
    const ens = await fetchJson<{ address?: string | null; name?: string | null }>(`https://api.ensideas.com/ens/resolve/${q}`);
    if (ens?.address && /^0x[a-fA-F0-9]{40}$/.test(ens.address)) {
      return Response.json(
        { ok: true, input: q, kind: "ens", resolved: ens.address, summary: `${q} → ${ens.address}` },
        { headers: { "cache-control": "public, max-age=120" } }
      );
    }
  }

  // 3) Free-text → Blockscout search (contracts, tokens by name).
  const search = await fetchJson<{ items?: Array<{ address?: string; address_hash?: string; name?: string; symbol?: string; type?: string }> }>(
    `${V2}/search?q=${encodeURIComponent(q)}`
  );
  const hit = (search?.items || []).find((i) => i.address || i.address_hash);
  if (hit) {
    const a = hit.address || hit.address_hash || "";
    const name = hit.name || hit.symbol || q;
    return Response.json(
      { ok: true, input: q, kind: hit.type || "search", resolved: a, name, summary: `${q} → ${a} (${name}${hit.type ? `, ${hit.type}` : ""})` },
      { headers: { "cache-control": "public, max-age=120" } }
    );
  }

  return Response.json(
    { ok: true, input: q, resolved: null, summary: `could not resolve "${q}" to an address (no ENS, no contract/token by that name)` },
    { headers: { "cache-control": "public, max-age=60" } }
  );
}
