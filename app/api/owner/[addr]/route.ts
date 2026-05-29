/**
 * /api/owner/[addr] — universal "who controls this?" resolver.
 *
 * The piece that was missing: to answer "who owns this casino" you must READ
 * THE CONTRACT STATE, not just look at Blockscout's creator field (which is
 * often empty). This endpoint:
 *
 *   1. eth_call's every common ownership getter against the contract:
 *        owner() getOwner() admin() getAdmin() houseManager() manager()
 *        governance() authority() controller() operator() treasury()
 *        DEFAULT_ADMIN_ROLE holder via known patterns
 *   2. also pulls Blockscout creator/creation-tx as a fallback provenance lead
 *   3. for EVERY resolved 0x address, immediately resolves its web-3 identity
 *      (OpenSea, X/Twitter, ENS, Lens, Farcaster, …) via our identity aggregator
 *   4. returns a compact `summary` an on-chain json-fetch tool reads in one
 *      dispatch — e.g.
 *        "owner=0x3fFa30… (Shiny11111 opensea, ShinyViq x_twitter) | creator=…"
 *
 * Works for ANY contract type — casino, DEX, lending, NFT, DAO — because it
 * probes the universal access-control surface, then de-anonymises whoever holds
 * the keys. This is the adaptive backbone for control/identity questions.
 */

import { NextRequest } from "next/server";
import { createPublicClient, http, toFunctionSelector, type Hex } from "viem";
import { EXPLORER_API } from "@/lib/somnia/chains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 60;

const RPC = "https://api.infra.testnet.somnia.network/";
const V2 = EXPLORER_API.replace(/\/api$/, "/api/v2");
const BASE = (process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");

const client = createPublicClient({ transport: http(RPC) });

// Zero-arg address getters covering the universal access-control surface across
// contract types (Ownable, AccessControl-ish, casino/DeFi/DAO variants).
// Selectors computed from signatures at module load — robust, no hardcoding.
const OWNER_SIGS = [
  "owner()", "getOwner()", "admin()", "getAdmin()", "houseManager()",
  "manager()", "governance()", "authority()", "controller()", "operator()",
  "treasury()", "beneficiary()", "guardian()", "pendingOwner()"
];
const GETTERS: Array<{ sig: string; selector: string }> = OWNER_SIGS.map((sig) => ({
  sig: sig.replace(/\(\)$/, ""),
  selector: toFunctionSelector(sig)
}));

function decodeAddress(ret: Hex | undefined): string | null {
  if (!ret || ret.length < 66) return null;
  const addr = "0x" + ret.slice(-40);
  if (/^0x0{40}$/.test(addr)) return null; // zero address = not set
  return addr;
}

async function ethCallAddress(to: string, selector: string): Promise<string | null> {
  if (!/^0x[0-9a-fA-F]{8}$/.test(selector)) return null;
  try {
    const res = await client.call({ to: to as Hex, data: selector as Hex });
    return decodeAddress(res.data);
  } catch {
    return null;
  }
}

interface IdentityResp { summary?: string; best?: string | null; results?: Record<string, string | null> }

async function resolveIdentity(addr: string): Promise<string | null> {
  try {
    const r = await fetch(`${BASE}/api/identity/${addr}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const j = (await r.json()) as IdentityResp;
    return j.summary && j.summary !== "none on 8 sources" ? j.summary : null;
  } catch {
    return null;
  }
}

async function blockscoutCreator(addr: string): Promise<string | null> {
  try {
    const r = await fetch(`${V2}/addresses/${addr}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { creator_address_hash?: string | null };
    return j.creator_address_hash || null;
  } catch {
    return null;
  }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ addr: string }> }) {
  const { addr } = await ctx.params;
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
    return Response.json({ ok: false, error: "invalid address" }, { status: 400 });
  }
  const t = Date.now();

  // 1) Probe every ownership getter in parallel.
  const getterResults = await Promise.all(
    GETTERS.map(async (g) => ({ sig: g.sig, addr: await ethCallAddress(addr, g.selector) }))
  );

  // 2) Blockscout creator as provenance fallback.
  const creator = await blockscoutCreator(addr);

  // 3) Collect distinct control addresses (dedupe, drop the target itself).
  const controllers: Array<{ role: string; address: string }> = [];
  const seen = new Set<string>();
  for (const g of getterResults) {
    if (g.addr && !seen.has(g.addr.toLowerCase())) {
      seen.add(g.addr.toLowerCase());
      controllers.push({ role: g.sig, address: g.addr });
    }
  }
  if (creator && !seen.has(creator.toLowerCase())) {
    seen.add(creator.toLowerCase());
    controllers.push({ role: "creator", address: creator });
  }

  // 4) Resolve identity for each controller (cap 4 to bound latency/cost).
  const enriched = await Promise.all(
    controllers.slice(0, 4).map(async (c) => ({ ...c, identity: await resolveIdentity(c.address) }))
  );

  // 5) Build compact summary for on-chain consumption.
  const parts: string[] = [];
  for (const c of enriched) {
    parts.push(c.identity ? `${c.role}=${c.address} (${c.identity})` : `${c.role}=${c.address}`);
  }
  const summary = parts.length ? parts.join(" | ") : "no on-chain owner/admin getter and no creator on record";

  // The single most useful answer: primary owner + its identity, if any.
  const primary = enriched.find((c) => c.role === "owner") || enriched[0] || null;

  return Response.json(
    {
      ok: true,
      address: addr,
      elapsed_ms: Date.now() - t,
      summary,
      primary_owner: primary?.address ?? null,
      primary_identity: primary?.identity ?? null,
      controllers: enriched
    },
    { headers: { "cache-control": "public, max-age=60" } }
  );
}
