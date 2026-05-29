/**
 * /api/storage/[addr]?slot=N — read raw contract STORAGE slots.
 *
 * The deepest read: every contract variable lives in a storage slot. Reading
 * them directly exposes hidden state even on unverified contracts:
 *   • slot 0 is often `owner` or a packed struct
 *   • EIP-1967 implementation/admin slots (proxy internals)
 *   • paused flags, fee values, hidden admin addresses
 *
 * ?slot=<n|hex|name> where name ∈ {impl, admin, beacon} maps to EIP-1967 slots.
 * Returns the 32-byte word + an address-decoded view when it looks like one.
 */
import { NextRequest } from "next/server";
import { createPublicClient, http, type Hex } from "viem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 30;

const client = createPublicClient({ transport: http("https://api.infra.testnet.somnia.network/") });

const NAMED: Record<string, Hex> = {
  impl: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",        // EIP-1967 implementation
  admin: "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103",       // EIP-1967 admin
  beacon: "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50"       // EIP-1967 beacon
};

function toSlot(s: string): Hex {
  if (NAMED[s]) return NAMED[s];
  if (/^0x[0-9a-fA-F]+$/.test(s)) return s as Hex;
  // decimal index → 32-byte hex
  const n = BigInt(s || "0");
  return ("0x" + n.toString(16).padStart(64, "0")) as Hex;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ addr: string }> }) {
  const { addr } = await ctx.params;
  const slotArg = new URL(req.url).searchParams.get("slot") || "0";
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
    return Response.json({ ok: false, error: "invalid address", summary: "invalid address" }, { status: 200 });
  }
  const t = Date.now();
  const slot = toSlot(slotArg);
  try {
    const word = (await client.getStorageAt({ address: addr as Hex, slot })) || "0x";
    const hex = word.slice(2).padStart(64, "0");
    const asBig = BigInt("0x" + (hex || "0"));
    // address-shaped?
    const looksAddr = /^0{24}[0-9a-f]{40}$/.test(hex) && asBig !== 0n;
    const asAddr = looksAddr ? "0x" + hex.slice(24) : null;

    const interp = asAddr
      ? `address ${asAddr}`
      : asBig === 0n
        ? "empty (0)"
        : asBig < 1n << 64n
          ? `uint ${asBig.toString()}`
          : `raw 0x${hex}`;

    const summary = `slot ${slotArg} = ${interp}`;
    return Response.json(
      { ok: true, address: addr, slot, raw: word, as_address: asAddr, as_uint: asBig.toString(), summary, elapsed_ms: Date.now() - t },
      { headers: { "cache-control": "public, max-age=30" } }
    );
  } catch (e) {
    return Response.json(
      { ok: false, address: addr, slot, error: (e as Error).message.slice(0, 120), summary: `storage read failed for slot ${slotArg}` },
      { status: 200 }
    );
  }
}
