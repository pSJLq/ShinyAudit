/**
 * /api/selectors/[addr] — recover an UNVERIFIED contract's ABI from bytecode.
 *
 * The killer reverse-engineering primitive. Even with NO source code, every
 * Solidity contract's dispatcher contains PUSH4 <selector> opcodes for each
 * external function. We:
 *   1. fetch runtime bytecode via RPC
 *   2. scan for PUSH4 (0x63) immediates that look like function selectors
 *   3. resolve each 4-byte selector to a human signature via 4byte.directory
 *
 * Result: the callable surface of a contract nobody verified — e.g.
 * "11 functions: transfer(address,uint256), setOwner(address), sweep(), …".
 * This is how you understand a black-box contract.
 */
import { NextRequest } from "next/server";
import { createPublicClient, http, type Hex } from "viem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 300;

const client = createPublicClient({ transport: http("https://api.infra.testnet.somnia.network/") });

/** Extract candidate 4-byte selectors from runtime bytecode. */
function extractSelectors(code: string): string[] {
  const hex = code.startsWith("0x") ? code.slice(2) : code;
  const found = new Set<string>();
  // Walk opcodes; 0x63 = PUSH4, next 4 bytes (8 hex chars) are the immediate.
  // We also accept PUSH4 that appear inside the selector-compare dispatch.
  for (let i = 0; i + 10 <= hex.length; ) {
    const op = hex.slice(i, i + 2);
    const byte = parseInt(op, 16);
    if (op === "63") {
      const sel = hex.slice(i + 2, i + 10);
      if (/^[0-9a-f]{8}$/.test(sel) && sel !== "00000000" && sel !== "ffffffff") {
        found.add("0x" + sel);
      }
      i += 10;
      continue;
    }
    // skip the immediate of any PUSH1..PUSH32 (0x60..0x7f) to avoid false hits
    if (byte >= 0x60 && byte <= 0x7f) {
      const n = byte - 0x5f; // PUSH1 → 1 .. PUSH32 → 32
      i += 2 + n * 2;
      continue;
    }
    i += 2;
  }
  return [...found];
}

async function resolveSelector(sel: string): Promise<string | null> {
  try {
    const r = await fetch(`https://www.4byte.directory/api/v1/signatures/?hex_signature=${sel}&ordering=created_at`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(6000)
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { results?: Array<{ text_signature?: string }> };
    return j.results?.[0]?.text_signature || null;
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
  const code = await client.getBytecode({ address: addr as Hex }).catch(() => undefined);
  if (!code || code === "0x") {
    return Response.json(
      { ok: true, address: addr, summary: "no bytecode (EOA — no functions to recover)", selectors: [] },
      { headers: { "cache-control": "public, max-age=300" } }
    );
  }

  const selectors = extractSelectors(code).slice(0, 48); // cap to bound 4byte calls
  // Resolve in small batches — 4byte rate-limits big parallel bursts, which
  // was causing most lookups to fail. Batches of 8 keep it reliable.
  const resolved: Array<{ sel: string; sig: string | null }> = [];
  for (let i = 0; i < selectors.length; i += 8) {
    const batch = selectors.slice(i, i + 8);
    const r = await Promise.all(batch.map(async (s) => ({ sel: s, sig: await resolveSelector(s) })));
    resolved.push(...r);
  }
  const named = resolved.filter((r) => r.sig);
  const unknown = resolved.filter((r) => !r.sig);

  const sigs = named.map((r) => r.sig as string);
  // Heuristic flags from recovered signatures.
  const flags: string[] = [];
  const has = (re: RegExp) => sigs.some((s) => re.test(s));
  if (has(/^(transfer|transferFrom|approve|balanceOf)\(/)) flags.push("ERC20-like");
  if (has(/^(ownerOf|safeTransferFrom|tokenURI)\(/)) flags.push("ERC721-like");
  if (has(/^(owner|transferOwnership|onlyOwner)/)) flags.push("ownable");
  if (has(/(withdraw|sweep|drain|rescue|emergency)/i)) flags.push("⚠ has withdraw/sweep");
  if (has(/(mint|setTax|setFee|blacklist|setMaxTx|pause)/i)) flags.push("⚠ owner-mutable economics/blacklist");
  if (has(/(upgradeTo|setImplementation)/i)) flags.push("⚠ upgradeable");

  const summary =
    `${selectors.length} external functions (${named.length} matched in 4byte DB, ${unknown.length} custom/unknown): ` +
    (sigs.length
      ? sigs.slice(0, 10).map((s) => s.split("(")[0] + "()").join(", ") + (sigs.length > 10 ? ` +${sigs.length - 10}` : "")
      : "none matched public DB — all custom names") +
    (flags.length ? ` | flags: ${flags.join(", ")}` : "");

  return Response.json(
    {
      ok: true,
      address: addr,
      elapsed_ms: Date.now() - t,
      summary: summary.slice(0, 480),
      total_selectors: selectors.length,
      named: named.map((r) => ({ selector: r.sel, signature: r.sig })),
      unknown_selectors: unknown.map((r) => r.sel),
      flags
    },
    { headers: { "cache-control": "public, max-age=300" } }
  );
}
