/**
 * /api/source/[addr] — verified Solidity source, CONSENSUS-BOUNDED.
 *
 * Returning a full 82 KB contract body through the on-chain json-fetch agent
 * makes the validator subcommittee struggle to reach consensus on the huge
 * string — that was a real hang vector. This endpoint returns a security-
 * relevant, size-capped view that the agent can consensus on quickly:
 *
 *   • `summary`  — head of the source (pragma + imports + first contract) plus
 *                  every line that matches a security-sensitive pattern
 *                  (owner/onlyOwner, external call, delegatecall, selfdestruct,
 *                  transfer, randomness, mint, upgrade …), capped at ~9 KB.
 *   • `full_size`— byte length of the complete source (so the agent knows how
 *                  much was elided).
 *
 * The result stays a single on-chain dispatch with a real Somnia receipt.
 */

import { NextRequest } from "next/server";
import { EXPLORER_API } from "@/lib/somnia/chains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 120;

const V2 = EXPLORER_API.replace(/\/api$/, "/api/v2");
const CAP = 9000;

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(9000)
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

// Lines worth surfacing to a security auditor even when we must truncate.
const RISK = /(\bowner\b|onlyOwner|require\(|\.call\{|\.call\(|delegatecall|selfdestruct|suicide|\btransfer\(|\bsend\(|block\.(timestamp|number|difficulty|prevrandao)|blockhash|keccak256|ecrecover|mint|burn|withdraw|upgrade|implementation|initialize|assembly|unchecked|approve|setApprovalForAll|nonReentrant|modifier\b|payable\b|external\b|public\b)/i;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ addr: string }> }) {
  const { addr } = await ctx.params;
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
    return Response.json({ ok: false, error: "invalid address" }, { status: 400 });
  }
  const t = Date.now();
  const sc = await fetchJson<{ source_code?: string; name?: string; is_verified?: boolean; language?: string }>(
    `${V2}/smart-contracts/${addr}`
  );
  const full = sc?.source_code || "";
  if (!full) {
    return Response.json(
      { ok: true, address: addr, verified: false, full_size: 0, summary: "source not verified — bytecode-only; recommend verifying on Shannon Explorer" },
      { headers: { "cache-control": "public, max-age=120" } }
    );
  }

  let summary: string;
  if (full.length <= CAP) {
    summary = full;
  } else {
    // Head (covers pragma, imports, contract decl, first functions) …
    const head = full.slice(0, 5000);
    // … plus security-relevant lines from the remainder, deduped, capped.
    const tailLines = full.slice(5000).split("\n");
    const risky: string[] = [];
    let used = 0;
    for (const ln of tailLines) {
      if (RISK.test(ln)) {
        const clean = ln.trim().slice(0, 200);
        if (clean) {
          risky.push(clean);
          used += clean.length + 1;
          if (used > CAP - 5000) break;
        }
      }
    }
    summary =
      head +
      `\n\n/* … ${full.length - 5000} bytes elided — security-relevant lines from remainder: */\n` +
      risky.join("\n");
  }

  return Response.json(
    {
      ok: true,
      address: addr,
      name: sc?.name ?? null,
      language: sc?.language ?? null,
      verified: sc?.is_verified ?? true,
      full_size: full.length,
      summary
    },
    { headers: { "cache-control": "public, max-age=120" } }
  );
}
