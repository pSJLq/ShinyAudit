/**
 * /api/bytecode-scan/[addr] — static opcode analysis of UNVERIFIED bytecode.
 *
 * Reads the danger surface straight from opcodes, no source needed:
 *   • DELEGATECALL (0xf4) → can execute foreign code in its own context (proxy/risk)
 *   • SELFDESTRUCT (0xff) → can be destroyed, funds-trap risk
 *   • CALLCODE   (0xf2) → deprecated, dangerous
 *   • CALL       (0xf1) count → external-call surface
 *   • CREATE/CREATE2 (0xf0/0xf5) → deploys other contracts (factory)
 *   • SSTORE     (0x55) count → state-writing complexity
 *   • presence of revert strings (PUSH + LOG patterns are noisy; we count REVERT)
 *
 * Returns "12.3KB · DELEGATECALL×2 (proxy) · SELFDESTRUCT present ⚠ · 47 external CALLs · factory".
 */
import { NextRequest } from "next/server";
import { createPublicClient, http, type Hex } from "viem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 300;

const client = createPublicClient({ transport: http("https://api.infra.testnet.somnia.network/") });

/**
 * Count opcodes, skipping PUSH immediates so data isn't miscounted. Also strips
 * the Solidity CBOR metadata trailer (…a264697066735822…0033) which otherwise
 * injects spurious 0xff/0xf2 "opcodes" and causes SELFDESTRUCT false-positives.
 */
function opcodeHistogram(code: string): Record<number, number> {
  let hex = code.startsWith("0x") ? code.slice(2) : code;
  // CBOR metadata: last 2 bytes are its length; strip it from the opcode scan.
  if (hex.length > 8) {
    const mdLen = parseInt(hex.slice(-4), 16);
    const mdHexLen = (mdLen + 2) * 2; // +2 for the length word itself
    if (mdLen > 0 && mdLen < 200 && mdHexLen < hex.length) {
      hex = hex.slice(0, hex.length - mdHexLen);
    }
  }
  const counts: Record<number, number> = {};
  for (let i = 0; i + 2 <= hex.length; ) {
    const byte = parseInt(hex.slice(i, i + 2), 16);
    counts[byte] = (counts[byte] || 0) + 1;
    if (byte >= 0x60 && byte <= 0x7f) {
      i += 2 + (byte - 0x5f) * 2; // skip PUSHn immediate
    } else {
      i += 2;
    }
  }
  return counts;
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
      { ok: true, address: addr, summary: "no bytecode (EOA)", is_contract: false },
      { headers: { "cache-control": "public, max-age=300" } }
    );
  }
  const bytes = (code.length - 2) / 2;
  const h = opcodeHistogram(code);
  const c = (op: number) => h[op] || 0;

  const delegatecall = c(0xf4);
  const selfdestruct = c(0xff);
  const callcode = c(0xf2);
  const calls = c(0xf1);
  const staticcalls = c(0xfa);
  const create = c(0xf0) + c(0xf5);
  const sstore = c(0x55);
  const sload = c(0x54);
  const revert = c(0xfd);

  // HONESTY NOTE: this is linear disassembly with PUSH-immediate skipping —
  // fast and good, but jump tables / packed data can misalign by a byte, so a
  // SINGLE occurrence of a rare opcode (selfdestruct/callcode) is more likely a
  // misread data byte than real code. We only raise a hard ⚠ when the count is
  // above the noise floor; single hits are reported as low-confidence.
  const flags: string[] = [];
  if (delegatecall > 0) flags.push(`DELEGATECALL×${delegatecall} (proxy/upgradeable — runs foreign code)`);
  if (selfdestruct >= 2) flags.push(`⚠ SELFDESTRUCT×${selfdestruct} (contract can be destroyed)`);
  else if (selfdestruct === 1) flags.push(`possible SELFDESTRUCT (1 hit — low confidence, may be a data byte)`);
  if (callcode >= 2) flags.push(`⚠ CALLCODE×${callcode} (deprecated/dangerous)`);
  if (create > 0) flags.push(`CREATE×${create} (factory — deploys contracts)`);
  if (calls + staticcalls > 30) flags.push(`high external-call surface (${calls + staticcalls})`);

  const summary =
    `${(bytes / 1024).toFixed(1)}KB · ${calls} CALL / ${staticcalls} STATICCALL · ${sstore} SSTORE / ${sload} SLOAD · ${revert} REVERT` +
    (flags.length ? ` | ${flags.join(" · ")}` : " | no high-risk opcodes") +
    " | (linear-scan heuristic)";

  return Response.json(
    {
      ok: true,
      address: addr,
      elapsed_ms: Date.now() - t,
      is_contract: true,
      bytecode_kb: Number((bytes / 1024).toFixed(2)),
      summary: summary.slice(0, 480),
      opcodes: { delegatecall, selfdestruct, callcode, call: calls, staticcall: staticcalls, create, sstore, sload, revert },
      flags
    },
    { headers: { "cache-control": "public, max-age=300" } }
  );
}
