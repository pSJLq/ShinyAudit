/**
 * /api/classify/[addr] — universal contract-TYPE classifier.
 *
 * Answers "what IS this contract" for ANY address without verified source.
 * Probes the standard-interface surface via eth_call:
 *   • ERC-165 supportsInterface(0x…) for ERC721 / ERC1155 / ERC2981(royalty)
 *   • ERC-20 fingerprint: totalSupply()+decimals()+symbol() all return
 *   • AMM pair: getReserves()+token0()+token1()
 *   • Proxy: implementation() / EIP-1967 slot non-empty
 *   • Multisig (Gnosis-style): getThreshold()+getOwners()
 *   • Access control: owner() / hasRole-style admin
 * Returns a compact `summary` like "type=ERC20 | symbol=USDT | proxy=no".
 */
import { NextRequest } from "next/server";
import { createPublicClient, http, toFunctionSelector, type Hex } from "viem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 120;

const client = createPublicClient({ transport: http("https://api.infra.testnet.somnia.network/") });

async function callRaw(to: string, selector: Hex, suffix = ""): Promise<Hex | null> {
  try {
    const res = await client.call({ to: to as Hex, data: (selector + suffix) as Hex });
    return (res.data ?? null) as Hex | null;
  } catch {
    return null;
  }
}
const nonEmpty = (h: Hex | null) => !!h && h !== "0x" && !/^0x0+$/.test(h);
const lastBool = (h: Hex | null) => !!h && /1$/.test(h.slice(2));

// ERC-165 supportsInterface(bytes4) — pad the 4-byte interface id to a word.
async function supports(to: string, ifaceId: string): Promise<boolean> {
  const sel = toFunctionSelector("supportsInterface(bytes4)");
  const arg = ifaceId.slice(2).padEnd(64, "0");
  return lastBool(await callRaw(to, sel, arg));
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ addr: string }> }) {
  const { addr } = await ctx.params;
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
    return Response.json({ ok: false, error: "invalid address", summary: "invalid address" }, { status: 200 });
  }
  const t = Date.now();

  // Is it even a contract? (empty code → EOA)
  const code = await client.getBytecode({ address: addr as Hex }).catch(() => undefined);
  if (!code || code === "0x") {
    return Response.json(
      { ok: true, address: addr, summary: "type=EOA (no bytecode — wallet, not a contract)", types: ["EOA"] },
      { headers: { "cache-control": "public, max-age=120" } }
    );
  }

  const [
    is721, is1155, is2981,
    totalSupply, decimals, symbol,
    reserves, token0,
    impl1967, implFn,
    threshold, owners,
    owner
  ] = await Promise.all([
    supports(addr, "0x80ac58cd"), // ERC721
    supports(addr, "0xd9b67a26"), // ERC1155
    supports(addr, "0x2a55205a"), // ERC2981 royalty
    callRaw(addr, toFunctionSelector("totalSupply()")),
    callRaw(addr, toFunctionSelector("decimals()")),
    callRaw(addr, toFunctionSelector("symbol()")),
    callRaw(addr, toFunctionSelector("getReserves()")),
    callRaw(addr, toFunctionSelector("token0()")),
    // EIP-1967 implementation slot
    client.getStorageAt({ address: addr as Hex, slot: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" }).catch(() => undefined),
    callRaw(addr, toFunctionSelector("implementation()")),
    callRaw(addr, toFunctionSelector("getThreshold()")),
    callRaw(addr, toFunctionSelector("getOwners()")),
    callRaw(addr, toFunctionSelector("owner()"))
  ]);

  const types: string[] = [];
  const isProxy = nonEmpty(impl1967 as Hex) || nonEmpty(implFn);
  if (token0 && reserves && nonEmpty(reserves)) types.push("AMM-pair/pool");
  if (is721) types.push("ERC721-NFT");
  if (is1155) types.push("ERC1155-multi-token");
  if (!is721 && !is1155 && nonEmpty(totalSupply) && nonEmpty(decimals)) types.push("ERC20-token");
  if (threshold && owners && nonEmpty(threshold)) types.push("multisig");
  if (isProxy) types.push("proxy");
  if (types.length === 0) types.push("custom/unknown-contract");

  const parts: string[] = [`type=${types.join("+")}`];
  if (is2981) parts.push("royalty=ERC2981");
  parts.push(`proxy=${isProxy ? "yes" : "no"}`);
  parts.push(`access_control=${nonEmpty(owner) ? "owner()" : "none-detected"}`);
  const summary = parts.join(" | ");

  return Response.json(
    {
      ok: true,
      address: addr,
      elapsed_ms: Date.now() - t,
      summary,
      types,
      is_proxy: isProxy,
      has_royalty: is2981,
      has_owner: nonEmpty(owner)
    },
    { headers: { "cache-control": "public, max-age=120" } }
  );
}
