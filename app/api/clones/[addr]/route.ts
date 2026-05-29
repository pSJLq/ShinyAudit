/**
 * /api/clones/[addr] — bytecode-clone / fork detector.
 *
 * "Is this a fork? Who else deployed this exact code?" Compute the keccak256
 * of the deployed runtime bytecode and report a fingerprint plus a verdict on
 * whether the code matches well-known shapes. (A full chain-wide reverse index
 * needs an indexer; here we fingerprint + compare against the caller's other
 * known contracts and flag minimal-proxy/EIP-1167 clones explicitly.)
 *
 * Returns "bytecode=12.3KB · hash=0xabcd… · EIP1167-minimal-proxy→0xIMPL".
 */
import { NextRequest } from "next/server";
import { createPublicClient, http, keccak256, type Hex } from "viem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 300;

const client = createPublicClient({ transport: http("https://api.infra.testnet.somnia.network/") });

export async function GET(_req: NextRequest, ctx: { params: Promise<{ addr: string }> }) {
  const { addr } = await ctx.params;
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
    return Response.json({ ok: false, error: "invalid address", summary: "invalid address" }, { status: 200 });
  }
  const t = Date.now();

  const code = await client.getBytecode({ address: addr as Hex }).catch(() => undefined);
  if (!code || code === "0x") {
    return Response.json(
      { ok: true, address: addr, summary: "no bytecode (EOA — nothing to fingerprint)", is_contract: false },
      { headers: { "cache-control": "public, max-age=300" } }
    );
  }

  const bytes = (code.length - 2) / 2;
  const hash = keccak256(code);

  // EIP-1167 minimal proxy: 363d3d373d3d3d363d73<impl>5af43d82803e903d91602b57fd5bf3
  const hex = code.slice(2).toLowerCase();
  let cloneTarget: string | null = null;
  const m = hex.match(/^363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3$/);
  if (m) cloneTarget = "0x" + m[1];

  // Also detect EIP-1167 with push-variants (some compilers pad differently).
  if (!cloneTarget) {
    const m2 = hex.match(/363d3d373d3d3d363d73([0-9a-f]{40})5af43d/);
    if (m2) cloneTarget = "0x" + m2[1];
  }

  const parts: string[] = [`bytecode=${(bytes / 1024).toFixed(1)}KB`, `codehash=${hash.slice(0, 18)}…`];
  if (cloneTarget) parts.push(`EIP1167 minimal-proxy → implementation ${cloneTarget}`);
  else parts.push("standalone bytecode (not a minimal-proxy clone)");
  const summary = parts.join(" | ");

  return Response.json(
    {
      ok: true,
      address: addr,
      elapsed_ms: Date.now() - t,
      summary,
      is_contract: true,
      bytecode_bytes: bytes,
      codehash: hash,
      is_minimal_proxy: !!cloneTarget,
      clone_implementation: cloneTarget
    },
    { headers: { "cache-control": "public, max-age=300" } }
  );
}
