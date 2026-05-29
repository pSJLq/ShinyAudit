/**
 * /api/call?to=0x..&sig=getReserves()&args=a,b — UNIVERSAL view-call.
 *
 * The single most powerful primitive: read ANY view/pure function of ANY
 * contract by human signature, no ABI needed. This is what makes ShinyAudit
 * "ready for any task" at the contract-read layer:
 *
 *   getReserves()            → DEX pool depth
 *   balanceOf(0xTEAM)        → token held by a specific wallet
 *   cliff() / start() / released()  → vesting schedule
 *   totalSupply() decimals() → token economics
 *   getRoleMember(0x..,0)    → AccessControl admin
 *   ...literally anything with a known signature.
 *
 * The agent (or a human) supplies:
 *   to   — contract address
 *   sig  — function signature, e.g. "balanceOf(address)" or "getReserves()"
 *   args — comma-separated args matching the signature (addresses, uints, bools)
 *
 * We build the ABI from the signature, eth_call, and decode the result into a
 * compact `summary` string for one on-chain json-fetch dispatch + receipt.
 */

import { NextRequest } from "next/server";
import {
  createPublicClient,
  http,
  parseAbiItem,
  toFunctionSelector,
  decodeAbiParameters,
  type Hex,
  type AbiFunction
} from "viem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 30;

const RPC = "https://api.infra.testnet.somnia.network/";
const client = createPublicClient({ transport: http(RPC) });

/** Coerce a string arg into the type viem expects for the given solidity type. */
function coerceArg(raw: string, solType: string): unknown {
  const t = solType.trim();
  const v = raw.trim();
  if (t === "address") return v as Hex;
  if (t === "bool") return v === "true" || v === "1";
  if (/^u?int/.test(t)) {
    // bigint for integer types
    try { return BigInt(v); } catch { return 0n; }
  }
  if (t.endsWith("[]")) {
    // simple array: split on ; (so commas inside the whole args still work)
    return v.split(";").map((x) => coerceArg(x, t.slice(0, -2)));
  }
  return v; // string, bytes, etc.
}

/**
 * Heuristic decode of a raw 32-byte-aligned return blob when the caller did
 * NOT specify a return type (the common case — the agent rarely knows it).
 * We try, in order: address (if last 12 bytes of a word are zero-padded and
 * it looks like an address), uint256, then bytes→utf8 string.
 */
function autoDecodeRaw(data: Hex): string {
  if (!data || data === "0x") return "(empty)";
  const hex = data.slice(2);
  // Single word (64 hex chars) → most getters. Address vs uint is ambiguous
  // (both are one word), so disambiguate by MAGNITUDE:
  //   • val == 0                → "0" (zero uint / zero address)
  //   • 2^128 ≤ val < 2^160     → almost certainly an address (high bytes set
  //                               in the 20-byte range, too big for a normal
  //                               count/decimals/balance, too small for bytes32)
  //   • otherwise               → uint256 decimal (decimals, supply, balance…)
  if (hex.length === 64) {
    let n: bigint;
    try { n = BigInt("0x" + hex); } catch { return "0x" + hex; }
    if (n === 0n) return "0";
    const TWO128 = 1n << 128n;
    const TWO160 = 1n << 160n;
    if (n >= TWO128 && n < TWO160) {
      // looks like an address — render checksummable lower-hex
      return "0x" + hex.slice(24);
    }
    return n.toString();
  }
  // Multi-word → try ABI string decode (offset+len+data), else hex.
  try {
    const [s] = decodeAbiParameters([{ type: "string" }], data);
    if (typeof s === "string" && s.length) return s;
  } catch {
    /* not a string */
  }
  // Try a uint256[] / address as fallback: just show first word decoded + note.
  if (hex.length > 64) {
    return `0x${hex.slice(0, 128)}… (${hex.length / 2} bytes — specify returns(...) for full decode)`;
  }
  return "0x" + hex;
}

/** Serialize any decoded return value into a readable string. */
function stringifyResult(val: unknown): string {
  if (val === null || val === undefined) return "null";
  if (typeof val === "bigint") return val.toString();
  if (Array.isArray(val)) return val.map(stringifyResult).join(", ");
  if (typeof val === "object") {
    // tuple/struct → key=val pairs
    return Object.entries(val as Record<string, unknown>)
      .filter(([k]) => !/^\d+$/.test(k)) // drop numeric index dupes
      .map(([k, v]) => `${k}=${stringifyResult(v)}`)
      .join(", ");
  }
  return String(val);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const to = url.searchParams.get("to") || "";
  const sig = url.searchParams.get("sig") || "";
  const argsRaw = url.searchParams.get("args") || "";

  if (!/^0x[a-fA-F0-9]{40}$/.test(to)) {
    return Response.json({ ok: false, error: "invalid 'to' address", summary: "invalid address" }, { status: 200 });
  }
  if (!sig || !/\w+\s*\(/.test(sig)) {
    return Response.json({ ok: false, error: "invalid 'sig' — expected e.g. balanceOf(address)", summary: "invalid signature" }, { status: 200 });
  }

  const t = Date.now();
  let abiItem: AbiFunction;
  try {
    // parseAbiItem accepts "function balanceOf(address) view returns (uint256)"
    // but also bare "balanceOf(address)". Normalise to a view function decl.
    const decl = sig.startsWith("function ") ? sig : `function ${sig} view`;
    abiItem = parseAbiItem(decl) as AbiFunction;
  } catch (e) {
    return Response.json(
      { ok: false, error: `cannot parse signature: ${(e as Error).message.slice(0, 120)}`, summary: "bad signature" },
      { status: 200 }
    );
  }

  // Build args array coerced to the right types.
  const inputs = abiItem.inputs || [];
  const argList = argsRaw ? argsRaw.split(",") : [];
  let args: unknown[];
  try {
    args = inputs.map((inp, i) => coerceArg(argList[i] ?? "", inp.type));
  } catch (e) {
    return Response.json({ ok: false, error: `arg coercion failed: ${(e as Error).message.slice(0, 100)}`, summary: "bad args" }, { status: 200 });
  }

  const hasReturns = (abiItem.outputs?.length ?? 0) > 0;
  try {
    let summary: string;
    if (hasReturns) {
      // Caller specified returns(...) — proper typed decode.
      const result = await client.readContract({
        address: to as Hex,
        abi: [abiItem],
        functionName: abiItem.name,
        args
      });
      summary = stringifyResult(result);
    } else {
      // No return type given — raw eth_call + heuristic decode. This is the
      // common agent path: it knows the function name but not the ABI return.
      const selector = toFunctionSelector(abiItem);
      // Encode args if any (only supported for simple single-word args here).
      let data: Hex = selector;
      if (args.length > 0) {
        const { encodeAbiParameters } = await import("viem");
        const encoded = encodeAbiParameters(abiItem.inputs, args);
        data = (selector + encoded.slice(2)) as Hex;
      }
      const res = await client.call({ to: to as Hex, data });
      summary = autoDecodeRaw((res.data || "0x") as Hex);
    }
    return Response.json(
      {
        ok: true,
        to,
        sig,
        decoded_typed: hasReturns,
        elapsed_ms: Date.now() - t,
        summary: summary.slice(0, 480),
        raw: summary
      },
      { headers: { "cache-control": "public, max-age=30" } }
    );
  } catch (e) {
    const err = e as Error & { shortMessage?: string };
    const msg = (err.shortMessage || err.message || "call reverted").split("\n")[0].slice(0, 160);
    return Response.json(
      { ok: false, to, sig, error: msg, summary: `reverted: ${msg}` },
      { status: 200, headers: { "cache-control": "public, max-age=10" } }
    );
  }
}
